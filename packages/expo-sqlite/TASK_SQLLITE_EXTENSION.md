# SQLite Extension Support for expo-sqlite

This document outlines the tasks needed to implement SQLite extension support in expo-sqlite, with a focus on enabling extensions like sqlite-vec for vector embeddings. The implementation will follow Expo's plugin architecture to make it configurable.

## Project Goals

- Add support for loading SQLite extensions in expo-sqlite
- Create a plugin configuration system to enable/disable extensions
- Support pre-built extensions like sqlite-vec for vector embeddings
- Maintain backward compatibility with existing expo-sqlite users
- Document the implementation for both users and potential contributors

## Implementation Checklist

### 1. Plugin Configuration

- [ ] Extend `withSQLite.ts` plugin to support extension configuration:
  - [ ] Add extension options to plugin interface
  - [ ] Support extension name, path, and entry point configuration
  - [ ] Allow specifying iOS and Android specific options
  - [ ] Enable/disable via a simple boolean flag

Example configuration:
```javascript
// app.config.js
export default {
  expo: {
    plugins: [
      [
        "expo-sqlite",
        {
          extensions: [
            {
              name: "sqlite-vec",
              enabled: true,
              ios: {
                framework: "path/to/framework"
              },
              android: {
                library: "path/to/library"
              },
              entryPoint: "sqlite3_vec_init"
            }
          ]
        }
      ]
    ]
  }
};
```

### 2. Build System Changes

#### 2.1 iOS Build System

- [ ] Modify `expo-sqlite.podspec` to handle extension frameworks
- [ ] Add SQLite compilation flags to enable extension loading (`SQLITE_ENABLE_LOAD_EXTENSION`)
- [ ] Create mechanism to include extension frameworks/libraries
- [ ] Implement framework path resolution for runtime loading

#### 2.2 Android Build System

- [ ] Update `build.gradle` to support extension libraries
- [ ] Add preprocessor definitions for extension support
- [ ] Update CMake configuration to enable extension loading
- [ ] Create JNI bridge for extension loading

### 3. Native Code Implementation

#### 3.1 iOS Implementation

- [ ] Modify `SQLiteModule.swift` to support extension loading
- [ ] Add runtime framework path resolution
- [ ] Implement extension loading function:
  ```swift
  func loadExtension(database: NativeDatabase, path: String, entryPoint: String?) throws
  ```
- [ ] Add error handling for extension loading failures
- [ ] Expose functions through module definition

#### 3.2 Android Implementation

- [ ] Update `NativeDatabaseBinding.cpp` to support extension loading
- [ ] Add proper JNI bindings for extension functions
- [ ] Implement extension loading methods
- [ ] Add error handling and reporting
- [ ] Expose functions through JNI interface

### 4. JavaScript API

- [ ] Add extension loading API to `SQLiteDatabase` class:
  ```typescript
  loadExtensionAsync(path: string, entryPoint?: string): Promise<void>;
  ```
- [ ] Add automatic extension loading based on configuration
- [ ] Create utility functions for common extensions like sqlite-vec
- [ ] Add TypeScript types for extension-specific functions

### 5. sqlite-vec Integration

- [ ] Create build script for sqlite-vec (or use pre-built binaries)
- [ ] Implement XCFramework packaging for iOS
- [ ] Implement .so library packaging for Android
- [ ] Add vector-specific utility functions to JavaScript API
- [ ] Test vector operations on both platforms

### 6. Testing

- [ ] Create unit tests for extension loading
- [ ] Create integration tests with sqlite-vec
- [ ] Test on various device configurations
- [ ] Test with EAS Build
- [ ] Test with development builds and Expo Go (if applicable)
- [ ] Benchmark performance

### 7. Documentation

- [ ] Update README.md with extension loading information
- [ ] Create detailed documentation for plugin configuration
- [ ] Add examples for common extensions
- [ ] Document security considerations
- [ ] Create specific guide for sqlite-vec usage
- [ ] Add API reference for new methods

### 8. PR Preparation

- [ ] Clean up code and ensure consistent style
- [ ] Add detailed commit messages
- [ ] Create comprehensive PR description
- [ ] Include test results and examples
- [ ] Address potential security concerns
- [ ] Provide migration guide for existing users

## Security Considerations

- SQLite extensions are native code with full system access
- Document security implications clearly
- Consider adding a verification mechanism for extensions
- Warning: iOS App Store guidelines may have restrictions on dynamic code loading

## Performance Considerations

- Loading extensions may impact startup time
- Vector operations can be computationally expensive
- Document performance implications
- Consider adding benchmarking tools

## Dependencies

- SQLite compiled with extension support
- Pre-built or compilable extension libraries
- iOS/Android build tools
- XCFramework packaging tools for iOS

## Resources

- [SQLite Extension Documentation](https://www.sqlite.org/loadext.html)
- [sqlite-vec GitHub Repository](https://github.com/asg017/sqlite-vec)
- [Expo Config Plugin Documentation](https://docs.expo.dev/guides/config-plugins/)
- [op-sqlite Implementation Reference](https://github.com/ospfranco/op-sqlite)
