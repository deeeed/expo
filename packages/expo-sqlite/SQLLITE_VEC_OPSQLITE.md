# Adding sqlite-vec to an expo-sqlite Fork

This document explains how [sqlite-vec](https://github.com/asg017/sqlite-vec) is implemented in op-sqlite and provides guidance on implementing it in an expo-sqlite fork.

## Overview

sqlite-vec is an extension for SQLite that adds vector embedding functionality, which is especially useful for RAG (Retrieval-Augmented Generation) applications. It's not part of the SQLite core but is loaded as an extension.

## Implementation in op-sqlite

### 1. Configuration

In op-sqlite, sqlite-vec is enabled via a configuration flag in package.json:

```json
{
  "op-sqlite": {
    "sqliteVec": true
  }
}
```

This flag is read during the build process to determine whether to include and load the extension.

### 2. Build System Integration

#### Android

For Android, the build process:

1. Reads the `sqliteVec` flag from package.json
2. Passes `-DUSE_SQLITE_VEC=1` to CMake when enabled
3. This defines the `OP_SQLITE_USE_SQLITE_VEC` preprocessor macro in the C++ code

```gradle
// From android/build.gradle
def useSqliteVec = opsqliteConfig["sqliteVec"]
// ...
arguments "-DUSE_SQLITE_VEC=${useSqliteVec ? 1 : 0}"
```

#### iOS

For iOS, the op-sqlite.podspec reads the configuration and includes the framework:

```ruby
# From op-sqlite.podspec
use_sqlite_vec = op_sqlite_config["sqliteVec"] == true
# ...
if use_sqlite_vec
  frameworks.push("ios/sqlitevec.xcframework")
end
```

The SQLite-vec extension is packaged as an XCFramework and included in the project.

### 3. Loading the Extension

The C++ code conditionally loads the extension when the database is opened:

```cpp
// In cpp/bridge.cpp
#ifdef OP_SQLITE_USE_SQLITE_VEC
  const char *vec_entry_point = "sqlite3_vec_init";
  
  sqlite3_load_extension(db, sqlite_vec_path.c_str(), vec_entry_point, &errMsg);
  
  if (errMsg != nullptr) {
    throw std::runtime_error(errMsg);
  }
#endif
```

On iOS, the extension path is determined at runtime:

```objc
// In ios/OPSQLite.mm
NSBundle *libsqlitevec_bundle = [NSBundle bundleWithIdentifier:@"com.ospfranco.sqlitevec"];
NSString *sqlite_vec_path = [libsqlitevec_bundle pathForResource:@"sqlitevec" ofType:@""];
```

### 4. Building and Including the Extension

#### Download and Build Process

op-sqlite uses a dedicated build script (`scripts/build-sqlite-vec.sh`) to download and build sqlite-vec. Here's a breakdown of the process:

1. **Download the source code**:
   ```bash
   # Download sqlite-vec source for a specific version
   wget -O sqlite-vec.tar.gz "https://github.com/asg017/sqlite-vec/archive/refs/tags/v$SQLITEVEC_VERSION.tar.gz"
   tar -xf sqlite-vec.tar.gz
   ```

2. **iOS Build**:
   - The script compiles sqlite-vec for multiple architectures:
     - iOS arm64 (physical devices)
     - iOS x86_64 (simulator)
     - iOS arm64 simulator (for Apple Silicon Macs)
     - tvOS architectures (if needed)
   
   ```bash
   # Example of compilation for iOS arm64
   $CC_ios_arm64 $IOS_ARM64_FLAGS -c ../sqlite-vec.c -o $OUT_DIR_ios_arm64/sqlite-vec.o -isysroot $IOS_SDK_PATH
   $CC_ios_arm64 -dynamiclib -o $OUT_DIR_ios_arm64/sqlitevec $OUT_DIR_ios_arm64/sqlite-vec.o -isysroot $IOS_SDK_PATH $IOS_LDFLAGS
   ```

3. **Android Build**:
   - For Android, the script downloads pre-built binaries for different architectures:
     ```bash
     local download_url="https://github.com/asg017/sqlite-vec/releases/download/v$SQLITEVEC_VERSION/sqlite-vec-$SQLITEVEC_VERSION-loadable-android-$arch.tar.gz"
     wget -O sqlite-vec-$SQLITEVEC_VERSION-loadable-android-$arch.tar.gz $download_url
     ```
   - These binaries are then placed in the appropriate jniLibs directory by architecture

4. **Packaging**:
   - iOS: Binaries are packaged as an XCFramework with proper Info.plist files
     ```bash
     # Creates the fat binary for simulators
     lipo -create ./ios/x86_64/sqlitevec ./ios/arm64_simulator/sqlitevec -output ios/sim_fat/sqlitevec
     
     # Copies to the XCFramework structure
     cp ./ios/arm64/sqlitevec ../../ios/sqlitevec.xcframework/ios-arm64/sqlitevec.framework/
     install_name_tool -id @rpath/sqlitevec.framework/sqlitevec ../../ios/sqlitevec.xcframework/ios-arm64/sqlitevec.framework/sqlitevec
     ```

   - Android: Binaries are placed in the jniLibs directory by architecture
     ```bash
     # Directory structure for Android
     android/
       jniLibs/
         arm64-v8a/libsqlite_vec.so
         armeabi-v7a/libsqlite_vec.so
         x86/libsqlite_vec.so
         x86_64/libsqlite_vec.so
     ```

#### Project Structure

The compiled binaries are organized within the project as follows:

1. **iOS**:
   ```
   ios/
     sqlitevec.xcframework/
       ios-arm64/
         sqlitevec.framework/
           Info.plist
           sqlitevec        # The actual binary
       ios-arm64_x86_64-simulator/
         sqlitevec.framework/
           Info.plist
           sqlitevec        # Fat binary for simulators
   ```

2. **Android**:
   ```
   android/
     jniLibs/
       arm64-v8a/libsqlite_vec.so
       armeabi-v7a/libsqlite_vec.so
       x86/libsqlite_vec.so
       x86_64/libsqlite_vec.so
   ```

#### Build-Time Integration

1. **iOS (CocoaPods)**:
   - The XCFramework is included in the pod via `frameworks.push("ios/sqlitevec.xcframework")` in the podspec
   - CocoaPods handles embedding the framework in the final app

2. **Android (Gradle/CMake)**:
   - The shared libraries in jniLibs are automatically included by the Android build system
   - The C++ code accesses them through JNI

#### Runtime Path Resolution

1. **iOS**:
   - At runtime, the extension is located via bundle identifier:
     ```objc
     NSBundle *libsqlitevec_bundle = [NSBundle bundleWithIdentifier:@"com.ospfranco.sqlitevec"];
     NSString *sqlite_vec_path = [libsqlitevec_bundle pathForResource:@"sqlitevec" ofType:@""];
     ```

2. **Android**:
   - Android loads the .so files automatically based on the device architecture
   - The extension is loaded with an absolute path to the .so file

## Implementing in expo-sqlite

To add sqlite-vec to your expo-sqlite fork, you'll need to:

### 1. Add Configuration Option

Create a mechanism to enable/disable sqlite-vec. This could be:
- A configuration in package.json similar to op-sqlite
- A build-time environment variable
- A parameter in your custom expo-config plugin

### 2. Prepare the Extension Binaries

You have two options:
- Build sqlite-vec yourself for all required platforms (reference op-sqlite's build-sqlite-vec.sh)
- Use pre-built binaries from sqlite-vec releases

For Expo specifically, consider creating:
1. A build script that runs during the prebuild phase
2. An Expo config plugin that handles the configuration and copying binaries to the right locations

### 3. Modify the Build System

#### For iOS (in the podspec):
1. Check for the enabled flag
2. Include the pre-built XCFramework or compile it as part of the build
3. Ensure the extension can be located at runtime

#### For Android:
1. Modify the CMake configuration to define an appropriate preprocessor macro
2. Include the extension binary in the project
3. Ensure SQLite is compiled with extension loading support

### 4. Add Runtime Loading Code

Add code to load the extension when a database is opened:

```cpp
int sqlite3_enable_load_extension(sqlite3* db, int onoff);  // Enable extension loading
int sqlite3_load_extension(
  sqlite3 *db,          // Database connection
  const char *zFile,    // Path to extension
  const char *zProc,    // Entry point (usually "sqlite3_vec_init")
  char **pzErrMsg       // Error message if any
);
```

Ensure SQLite is compiled with `-DSQLITE_ENABLE_LOAD_EXTENSION` to allow loading extensions.

### 5. Expose API for Vector Functions

Create JavaScript bindings to the vector functions provided by sqlite-vec:

- `vec_cosine_similarity`
- `vec_inner_product`
- `vec_euclidean_distance`
- `vec_l2_distance`
- etc.

## Important Considerations

1. **Extension Loading Security**: SQLite extensions are compiled C code with full system access. Make sure your users understand the security implications.

2. **iOS Restrictions**: iOS embedded SQLite does NOT support extension loading. You must compile SQLite from source to enable extension loading.

3. **Build Size**: Including sqlite-vec will increase your app size.

4. **Performance**: Vector operations may have performance implications, especially on older devices.

5. **Compatibility**: Test thoroughly across different platforms and devices.

6. **Expo Specific**: For Expo, you'll need to ensure your implementation works with:
   - EAS Build
   - Development builds
   - Local builds with `npx expo prebuild`
   - Both managed and bare workflow

## Usage Example

After implementation, users would be able to use sqlite-vec functions like:

```javascript
const db = SQLite.openDatabase("mydb.db");
await db.exec([
  "CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vectors(dim=3)",
  "INSERT INTO vectors VALUES (1, '[1.0, 2.0, 3.0]')",
  "INSERT INTO vectors VALUES (2, '[4.0, 5.0, 6.0]')",
  "SELECT vec_cosine_similarity(embedding, '[7.0, 8.0, 9.0]') as similarity FROM vectors ORDER BY similarity DESC"
]);
```

## Resources

- [sqlite-vec GitHub Repository](https://github.com/asg017/sqlite-vec)
- [SQLite Extension Loading Documentation](https://www.sqlite.org/loadext.html)
- [op-sqlite Implementation](https://github.com/op-engineering/op-sqlite)
