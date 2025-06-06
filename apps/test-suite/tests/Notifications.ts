import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { type EventSubscription, Platform } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import {
  AndroidImportance,
  DailyTriggerInput,
  NotificationAction,
  NotificationBehavior,
  NotificationCategoryOptions,
  NotificationChannelInput,
  NotificationContentInput,
  NotificationHandler,
  NotificationTriggerInput,
  SchedulableNotificationTriggerInput,
  SchedulableTriggerInputTypes,
} from 'expo-notifications';
import { Alert, AppState } from 'react-native';

import { waitFor } from './helpers';
import * as TestUtils from '../TestUtils';
import { isInteractive } from '../utils/Environment';

export const name = 'Notifications';

const behaviorEnableAll: NotificationBehavior = {
  shouldShowList: true,
  shouldShowBanner: true,
  shouldPlaySound: true,
  shouldSetBadge: true,
};

export async function test(t) {
  const shouldSkipTestsRequiringPermissions =
    await TestUtils.shouldSkipTestsRequiringPermissionsAsync();
  const describeWithPermissions = shouldSkipTestsRequiringPermissions ? t.xdescribe : t.describe;
  const onlyInteractiveDescribe = isInteractive ? t.describe : t.xdescribe;

  t.describe('Notifications', () => {
    t.describe('getDevicePushTokenAsync', () => {
      t.it('resolves with a token equal to the one from addPushTokenListener()', async () => {
        let tokenFromEvent = null;
        const subscription = Notifications.addPushTokenListener((newEvent) => {
          tokenFromEvent = newEvent;
        });
        const devicePushToken = await Notifications.getDevicePushTokenAsync();
        const expectedType = Platform.OS === 'web' ? 'object' : 'string';
        t.expect(typeof devicePushToken.data).toBe(expectedType);
        await waitFor(1000);
        t.expect(tokenFromEvent).toEqual(devicePushToken);
        subscription.remove();
      });

      t.it('resolves when multiple calls are issued', async () => {
        const results = await Promise.all([
          Notifications.getDevicePushTokenAsync(),
          Notifications.getDevicePushTokenAsync(),
        ]);
        t.expect(results[0].data).toBeDefined();
        t.expect(results[0].data).toBe(results[1].data);
      });

      // Not running this test on web since Expo push notification doesn't yet support web.
      const itWithExpoPushToken = ['ios', 'android'].includes(Platform.OS) ? t.it : t.xit;
      itWithExpoPushToken('fetches Expo push token', async () => {
        const expoPushToken = await Notifications.getExpoPushTokenAsync();
        t.expect(expoPushToken.type).toBe('expo');
        t.expect(typeof expoPushToken.data).toBe('string');
      });

      itWithExpoPushToken('resolves when mixed multiple calls are issued', async () => {
        const [expoToken, deviceToken] = await Promise.all([
          Notifications.getExpoPushTokenAsync(),
          Notifications.getDevicePushTokenAsync(),
        ]);
        t.expect(typeof expoToken.data).toBe('string');
        t.expect(typeof deviceToken.data).toBe('string');
      });
    });

    // Not running those tests on web since Expo push notification doesn't yet support web.
    const describeWithExpoPushToken = ['ios', 'android'].includes(Platform.OS)
      ? t.describe
      : t.xdescribe;

    describeWithExpoPushToken('when a push notification is sent', () => {
      let notificationToHandle: Notifications.Notification | undefined;
      let handleSuccessEvent: string | undefined;
      let handleErrorEvent: Parameters<NotificationHandler['handleError']>;

      let receivedEvent: Notifications.Notification | undefined;
      let receivedSubscription = null;

      let expoPushToken: string | undefined;

      let handleFuncOverride: NotificationHandler['handleNotification'];

      t.beforeAll(async () => {
        const pushToken = await Notifications.getExpoPushTokenAsync();
        expoPushToken = pushToken.data;

        Notifications.setNotificationHandler({
          handleNotification: async (notification) => {
            notificationToHandle = notification;
            if (handleFuncOverride) {
              return await handleFuncOverride(notification);
            } else {
              return behaviorEnableAll;
            }
          },
          handleSuccess: (event) => {
            handleSuccessEvent = event;
          },
          handleError: (...eventArgs) => {
            handleErrorEvent = eventArgs;
          },
        });

        receivedSubscription = Notifications.addNotificationReceivedListener((event) => {
          receivedEvent = event;
        });
      });

      t.beforeEach(async () => {
        receivedEvent = null;
        handleErrorEvent = null;
        handleSuccessEvent = null;
        notificationToHandle = null;
        await sendTestPushNotification(expoPushToken);
      });

      t.afterAll(() => {
        if (receivedSubscription) {
          receivedSubscription.remove();
          receivedSubscription = null;
        }
        Notifications.setNotificationHandler(null);
      });

      t.it('calls the `handleNotification` callback of the notification handler', async () => {
        await waitUntil(() => !!notificationToHandle);

        t.expect(notificationToHandle).not.toBeNull();
      });

      t.it('emits a "notification received" event with `data` value', async () => {
        await waitUntil(() => !!receivedEvent);
        t.expect(receivedEvent).not.toBeNull();
        t.expect(receivedEvent.request.content.data.fieldTestedInDataContentsTest).toBe(42);
        if (Platform.OS === 'android') {
          // @ts-expect-error delete this later, see TODO in mapNotificationContent
          t.expect(typeof receivedEvent.request.content.dataString).toBe('string');
        }
      });

      t.describe('if handler responds in time', async () => {
        t.it(
          'calls `handleSuccess` callback of the notification handler',
          async () => {
            await waitUntil(() => !!handleSuccessEvent);
            t.expect(handleSuccessEvent).not.toBeNull();
            t.expect(handleErrorEvent).toBeNull();
          },
          10000
        );
      });

      t.describe('if handler fails to respond in time', async () => {
        t.beforeAll(() => {
          handleFuncOverride = async () => {
            await waitFor(3000);
            return behaviorEnableAll;
          };
        });

        t.afterAll(() => {
          handleFuncOverride = null;
        });

        t.it(
          'calls `handleError` callback of the notification handler',
          async () => {
            await waitUntil(() => !!handleErrorEvent);
            t.expect(handleErrorEvent).not.toBeNull();
            t.expect(typeof handleErrorEvent[0]).toBe('string');
            t.expect(handleSuccessEvent).toBeNull();
          },
          10000
        );
      });
    });

    t.describe('getPermissionsAsync', () => {
      t.it('resolves with an object', async () => {
        const permissions = await Notifications.getPermissionsAsync();
        t.expect(permissions).toBeDefined();
        t.expect(typeof permissions).toBe('object');
      });
    });

    describeWithPermissions('requestPermissionsAsync', () => {
      t.it('resolves without any arguments', async () => {
        const permissions = await Notifications.requestPermissionsAsync();
        t.expect(permissions).toBeDefined();
        t.expect(typeof permissions).toBe('object');
      });

      t.it('resolves with specific permissions requested', async () => {
        const permissions = await Notifications.requestPermissionsAsync({
          ios: {
            provideAppNotificationSettings: true,
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        t.expect(permissions).toBeDefined();
        t.expect(typeof permissions).toBe('object');
        t.expect(typeof permissions.status).toBe('string');
      });
    });

    t.describe('Notification channels', () => {
      // Implementation detail!
      const fallbackChannelId = 'expo_notifications_fallback_notification_channel';
      const fallbackChannelName = 'Miscellaneous';
      const testChannelId = 'test-channel-id';
      const testChannel: NotificationChannelInput = {
        name: 'Test channel',
        importance: AndroidImportance.UNSPECIFIED,
      };

      t.describe('getNotificationChannelAsync()', () => {
        t.it('returns null if there is no such channel', async () => {
          const channel =
            await Notifications.getNotificationChannelAsync('non-existent-channel-id');
          t.expect(channel).toBe(null);
        });

        // Test push notifications sent without a channel ID should create a fallback channel
        if (Platform.OS === 'android' && Device.platformApiLevel >= 26) {
          t.it('returns an object if there is such channel', async () => {
            const channel = await Notifications.getNotificationChannelAsync(fallbackChannelId);
            t.expect(channel).toBeDefined();
          });
        }
      });

      t.describe('getNotificationChannelsAsync()', () => {
        t.it('returns an array', async () => {
          const channels = await Notifications.getNotificationChannelsAsync();
          t.expect(channels).toEqual(t.jasmine.any(Array));
        });

        // Test push notifications sent without a channel ID should create a fallback channel
        if (Platform.OS === 'android' && Device.platformApiLevel >= 26) {
          t.it('contains the fallback channel', async () => {
            const channels = await Notifications.getNotificationChannelsAsync();
            t.expect(channels).toContain(
              t.jasmine.objectContaining({
                // Implementation detail!
                id: fallbackChannelId,
                name: fallbackChannelName,
              })
            );
          });
        }
      });

      t.describe('setNotificationChannelAsync()', () => {
        t.beforeAll(async () => {
          await Notifications.deleteNotificationChannelAsync(testChannelId);
        });
        t.afterEach(async () => {
          await Notifications.deleteNotificationChannelAsync(testChannelId);
        });

        if (Platform.OS === 'android' && Device.platformApiLevel >= 26) {
          t.it('returns the created channel', async () => {
            const channel = await Notifications.setNotificationChannelAsync(
              testChannelId,
              testChannel
            );
            t.expect(channel).toEqual(
              t.jasmine.objectContaining({ ...testChannel, id: testChannelId })
            );
          });

          t.it('creates a channel', async () => {
            const preChannels = await Notifications.getNotificationChannelsAsync();
            const channelSpec = t.jasmine.objectContaining({ ...testChannel, id: testChannelId });
            t.expect(preChannels).not.toContain(channelSpec);
            await Notifications.setNotificationChannelAsync(testChannelId, testChannel);
            const postChannels = await Notifications.getNotificationChannelsAsync();
            t.expect(postChannels).toContain(channelSpec);
            t.expect(postChannels.length).toBeGreaterThan(preChannels.length);
          });

          t.it('sets custom properties', async () => {
            const randomChannelId = `test-channel-${Math.floor(Math.random() * 1000)}`;
            const spec: NotificationChannelInput = {
              name: 'Name',
              importance: Notifications.AndroidImportance.MIN,
              bypassDnd: true,
              description: 'Test channel',
              lightColor: '#FF231F7C',
              lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
              showBadge: false,
              sound: 'pop_sound.wav',
              audioAttributes: {
                usage: Notifications.AndroidAudioUsage.NOTIFICATION,
                contentType: Notifications.AndroidAudioContentType.SONIFICATION,
                flags: {
                  enforceAudibility: true,
                  requestHardwareAudioVideoSynchronization: true,
                },
              },
              vibrationPattern: [500, 500],
              enableLights: true,
              enableVibrate: true,
            };
            // we need to create a new channel every time to have android respect the settings
            const channel = await Notifications.setNotificationChannelAsync(randomChannelId, spec);
            await Notifications.deleteNotificationChannelAsync(randomChannelId);
            const expected = {
              ...spec,
              id: randomChannelId,
            };
            // it appears android may not always respect these settings
            delete expected.lockscreenVisibility;
            delete expected.sound;
            delete expected.bypassDnd;
            t.expect(channel).toEqual(t.jasmine.objectContaining(expected));
          });

          t.it('assigns a channel to a group', async () => {
            const groupId = 'test-group-id';
            try {
              await Notifications.setNotificationChannelGroupAsync(groupId, { name: 'Test group' });
              const channel = await Notifications.setNotificationChannelAsync(testChannelId, {
                ...testChannel,
                groupId,
              });
              t.expect(channel.groupId).toBe(groupId);
              const group = await Notifications.getNotificationChannelGroupAsync(groupId);
              t.expect(group.channels).toContain(t.jasmine.objectContaining(testChannel));
            } catch (e) {
              await Notifications.deleteNotificationChannelAsync(testChannelId);
              await Notifications.deleteNotificationChannelGroupAsync(groupId);
              throw e;
            }
          });

          t.it('updates a channel (only name and description can be changed)', async () => {
            await Notifications.setNotificationChannelAsync(testChannelId, {
              name: 'Name before change',
              importance: AndroidImportance.DEFAULT,
            });
            await Notifications.setNotificationChannelAsync(testChannelId, {
              name: 'Name after change',
              importance: AndroidImportance.DEFAULT,
            });
            const channels = await Notifications.getNotificationChannelsAsync();
            t.expect(channels).toContain(
              t.jasmine.objectContaining({
                name: 'Name after change',
                id: testChannelId,
              })
            );
            t.expect(channels).not.toContain(
              t.jasmine.objectContaining({
                name: 'Name before change',
                id: testChannelId,
              })
            );
          });
        } else {
          t.it("doesn't throw an error", async () => {
            await Notifications.setNotificationChannelAsync(testChannelId, testChannel);
          });
        }
      });

      t.describe('deleteNotificationChannelAsync()', () => {
        if (Platform.OS === 'android' && Device.platformApiLevel >= 26) {
          t.it('deletes a channel', async () => {
            const preChannels = await Notifications.getNotificationChannelsAsync();
            const channelSpec = t.jasmine.objectContaining({ ...testChannel, id: testChannelId });
            t.expect(preChannels).not.toContain(channelSpec);
            await Notifications.setNotificationChannelAsync(testChannelId, testChannel);
            const postChannels = await Notifications.getNotificationChannelsAsync();
            await Notifications.deleteNotificationChannelAsync(testChannelId);
            t.expect(postChannels).toContain(channelSpec);
            t.expect(postChannels.length).toBeGreaterThan(preChannels.length);
          });
        } else {
          t.it("doesn't throw an error", async () => {
            await Notifications.deleteNotificationChannelAsync(testChannelId);
          });
        }
      });
    });

    t.describe('Notification channel groups', () => {
      const testChannelGroupId = 'test-channel-group-id';
      const testChannelGroup = { name: 'Test channel group' };

      t.describe('getNotificationChannelGroupAsync()', () => {
        t.it('returns null if there is no such channel group', async () => {
          const channelGroup = await Notifications.getNotificationChannelGroupAsync(
            'non-existent-channel-group-id'
          );
          t.expect(channelGroup).toBe(null);
        });

        if (Platform.OS === 'android' && Device.platformApiLevel >= 26) {
          t.it('returns an object if there is such channel group', async () => {
            await Notifications.setNotificationChannelGroupAsync(
              testChannelGroupId,
              testChannelGroup
            );
            const channel =
              await Notifications.getNotificationChannelGroupAsync(testChannelGroupId);
            await Notifications.deleteNotificationChannelGroupAsync(testChannelGroupId);
            t.expect(channel).toBeDefined();
          });
        }
      });

      t.describe('getNotificationChannelGroupsAsync()', () => {
        if (Platform.OS === 'android' && Device.platformApiLevel >= 28) {
          t.it('returns an array', async () => {
            const channels = await Notifications.getNotificationChannelGroupsAsync();
            t.expect(channels).toEqual(t.jasmine.any(Array));
          });

          t.it('returns existing channel groups', async () => {
            const channel = await Notifications.setNotificationChannelGroupAsync(
              testChannelGroupId,
              testChannelGroup
            );
            const channels = await Notifications.getNotificationChannelGroupsAsync();
            await Notifications.deleteNotificationChannelGroupAsync(testChannelGroupId);
            t.expect(channels).toContain(channel);
          });
        } else {
          t.it("doesn't throw an error", async () => {
            await Notifications.getNotificationChannelGroupsAsync();
          });
        }
      });

      t.describe('setNotificationChannelGroupsAsync()', () => {
        t.afterEach(async () => {
          await Notifications.deleteNotificationChannelGroupAsync(testChannelGroupId);
        });

        if (Platform.OS === 'android' && Device.platformApiLevel >= 26) {
          t.it('returns the modified channel group', async () => {
            const group = await Notifications.setNotificationChannelGroupAsync(
              testChannelGroupId,
              testChannelGroup
            );
            t.expect(group).toEqual(
              t.jasmine.objectContaining({ ...testChannelGroup, id: testChannelGroupId })
            );
          });

          t.it('creates a channel group', async () => {
            const preChannelGroups = await Notifications.getNotificationChannelGroupsAsync();
            const channelGroupSpec = t.jasmine.objectContaining({
              ...testChannelGroup,
              id: testChannelGroupId,
            });
            t.expect(preChannelGroups).not.toContain(channelGroupSpec);
            await Notifications.setNotificationChannelGroupAsync(
              testChannelGroupId,
              testChannelGroup
            );
            const postChannelGroups = await Notifications.getNotificationChannelGroupsAsync();
            t.expect(postChannelGroups).toContain(channelGroupSpec);
            t.expect(postChannelGroups.length).toBeGreaterThan(preChannelGroups.length);
          });

          t.it('sets custom properties', async () => {
            const createSpec = {
              name: 'Test channel group',
              description: 'Used by `test-suite`',
            };
            const channelGroup = await Notifications.setNotificationChannelGroupAsync(
              testChannelGroupId,
              createSpec
            );
            const groupSpec = { ...createSpec, id: testChannelGroupId };
            if (Device.platformApiLevel < 28) {
              // Groups descriptions is only supported on API 28+
              delete groupSpec.description;
            }
            t.expect(channelGroup).toEqual(
              t.jasmine.objectContaining({ ...groupSpec, id: testChannelGroupId })
            );
          });

          t.it('updates a channel group', async () => {
            await Notifications.setNotificationChannelGroupAsync(testChannelGroupId, {
              name: 'Name before change',
            });
            await Notifications.setNotificationChannelGroupAsync(testChannelGroupId, {
              name: 'Name after change',
            });
            const channelGroups = await Notifications.getNotificationChannelGroupsAsync();
            t.expect(channelGroups).toContain(
              t.jasmine.objectContaining({
                name: 'Name after change',
                id: testChannelGroupId,
              })
            );
            t.expect(channelGroups).not.toContain(
              t.jasmine.objectContaining({
                name: 'Name before change',
                id: testChannelGroupId,
              })
            );
          });
        } else {
          t.it("doesn't throw an error", async () => {
            await Notifications.setNotificationChannelGroupAsync(
              testChannelGroupId,
              testChannelGroup
            );
          });
        }
      });
    });

    t.describe('Notification Categories', () => {
      const vanillaButton = {
        identifier: 'vanillaButton',
        buttonTitle: 'Destructive Option',
        options: {
          isDestructive: true,
          isAuthenticationRequired: true,
          opensAppToForeground: false,
        },
      } satisfies Notifications.NotificationAction;

      const textResponseButton = {
        identifier: 'textResponseButton',
        buttonTitle: 'Click to Respond with Text',
        options: {
          isDestructive: false,
          isAuthenticationRequired: true,
          opensAppToForeground: true,
        },
        textInput: { submitButtonTitle: 'Send', placeholder: 'Type Something' },
      } satisfies Notifications.NotificationAction;

      type CategoryParams = {
        identifier: string;
        actions: NotificationAction[];
        options?: NotificationCategoryOptions;
      };

      const testCategory1 = {
        identifier: 'testNotificationCategory1',
        actions: [vanillaButton],
        options: {
          previewPlaceholder: 'preview goes here',
          customDismissAction: false,
          allowInCarPlay: false,
          showTitle: false,
          showSubtitle: false,
          allowAnnouncement: false,
          categorySummaryFormat: '',
          intentIdentifiers: [],
        },
      } as const satisfies CategoryParams;
      const testCategory2 = {
        identifier: 'testNotificationCategory2',
        actions: [vanillaButton, textResponseButton],
        options: {
          customDismissAction: false,
          allowInCarPlay: true,
          showTitle: true,
          showSubtitle: true,
          allowAnnouncement: false,
          categorySummaryFormat: '',
          previewPlaceholder: 'exPreview',
          intentIdentifiers: [],
        },
      } as const satisfies CategoryParams;

      const allTestCategoryIds = ['testNotificationCategory1', 'testNotificationCategory2'];

      t.describe('getNotificationCategoriesAsync()', () => {
        let existingCategoriesCount = 0;
        t.beforeAll(async () => {
          existingCategoriesCount = (await Notifications.getNotificationCategoriesAsync()).length;
        });

        t.afterEach(async () => {
          for (const id of allTestCategoryIds) {
            await Notifications.deleteNotificationCategoryAsync(id);
          }
        });

        t.it('returns an empty array if there are no categories', async () => {
          t.expect((await Notifications.getNotificationCategoriesAsync()).length).toEqual(
            existingCategoriesCount
          );
        });

        t.it('returns an array with the just-created categories', async () => {
          await Notifications.setNotificationCategoryAsync(
            testCategory1.identifier,
            testCategory1.actions,
            testCategory1.options
          );
          await Notifications.setNotificationCategoryAsync(
            testCategory2.identifier,
            testCategory2.actions,
            testCategory2.options
          );
          t.expect((await Notifications.getNotificationCategoriesAsync()).length).toEqual(
            existingCategoriesCount + 2
          );
        });
      });

      t.describe('setNotificationCategoriesAsync()', () => {
        t.afterEach(async () => {
          for (const id of allTestCategoryIds) {
            await Notifications.deleteNotificationCategoryAsync(id);
          }
        });

        t.it(
          'given a category with two actions, presents notifications with the category, and asserts the response',
          async () => {
            const resultCategory = await Notifications.setNotificationCategoryAsync(
              testCategory2.identifier,
              testCategory2.actions,
              testCategory2.options
            );

            function attachResponseListener() {
              return new Promise<Notifications.NotificationResponse>((resolve) => {
                const listener = Notifications.addNotificationResponseReceivedListener((event) => {
                  responseEvents.push(event);
                  listener.remove();
                  resolve(event);
                });
              });
            }

            t.expect(resultCategory).toEqual({
              identifier: testCategory2.identifier,
              actions: [
                {
                  identifier: testCategory2.actions[0].identifier,
                  buttonTitle: testCategory2.actions[0].buttonTitle,
                  options: {
                    opensAppToForeground: testCategory2.actions[0].options.opensAppToForeground,
                    ...(Platform.OS === 'ios' && testCategory2.actions[0].options),
                  },
                  textInput: null,
                },
                {
                  identifier: testCategory2.actions[1].identifier,
                  buttonTitle: testCategory2.actions[1].buttonTitle,
                  options: {
                    opensAppToForeground: testCategory2.actions[1].options.opensAppToForeground,
                    ...(Platform.OS === 'ios' && testCategory2.actions[1].options),
                  },
                  textInput: {
                    placeholder: testCategory2.actions[1].textInput.placeholder,
                    ...(Platform.OS === 'ios' && {
                      submitButtonTitle: testCategory2.actions[1].textInput.submitButtonTitle,
                      title: testCategory2.actions[1].buttonTitle,
                    }),
                  },
                },
              ],
              options:
                Platform.OS === 'ios'
                  ? testCategory2.options
                  : {
                      // options are iOS-only
                    },
            });

            const responseEvents: Notifications.NotificationResponse[] = [];
            const responsePromise = attachResponseListener();

            Notifications.setNotificationHandler({
              handleNotification: async () => behaviorEnableAll,
            });

            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Press the destructive action button',
                categoryIdentifier: testCategory2.identifier,
              },
              trigger: null,
            });

            const firstResponse = await responsePromise;
            t.expect(firstResponse).toEqual(
              t.jasmine.objectContaining({
                actionIdentifier: vanillaButton.identifier,
              })
            );

            // Wait for the second response
            const secondResponsePromise = attachResponseListener();

            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Enter some response text',
                categoryIdentifier: testCategory2.identifier,
              },
              trigger: null,
            });

            const secondResponse = await secondResponsePromise;
            t.expect(secondResponse).toEqual(
              t.jasmine.objectContaining({
                actionIdentifier: textResponseButton.identifier,
                userText: t.jasmine.stringMatching(/.+/),
              })
            );
          },
          15000
        );
      });

      t.describe('deleteNotificationCategoriesAsync()', () => {
        t.afterEach(async () => {
          for (const id of allTestCategoryIds) {
            await Notifications.deleteNotificationCategoryAsync(id);
          }
        });
        t.it('deleting a category that does not exist returns false', async () => {
          const categoriesBefore = await Notifications.getNotificationCategoriesAsync();
          t.expect(
            await Notifications.deleteNotificationCategoryAsync('nonExistentCategoryId')
          ).toBe(false);
          const categoriesAfter = await Notifications.getNotificationCategoriesAsync();
          t.expect(categoriesAfter.length).toEqual(categoriesBefore.length);
        });

        t.it('deleting a category that does exist returns true', async () => {
          await Notifications.setNotificationCategoryAsync(
            testCategory2.identifier,
            testCategory2.actions,
            testCategory2.options
          );
          t.expect(
            await Notifications.deleteNotificationCategoryAsync('testNotificationCategory2')
          ).toBe(true);
        });

        t.it('returns an array of length 1 after creating 2 categories & deleting 1', async () => {
          await Notifications.setNotificationCategoryAsync(
            testCategory1.identifier,
            testCategory1.actions,
            testCategory1.options
          );
          await Notifications.setNotificationCategoryAsync(
            testCategory2.identifier,
            testCategory2.actions,
            testCategory2.options
          );
          const categoriesBefore = await Notifications.getNotificationCategoriesAsync();
          await Notifications.deleteNotificationCategoryAsync('testNotificationCategory1');
          const categoriesAfter = await Notifications.getNotificationCategoriesAsync();
          t.expect(categoriesBefore.length - 1).toEqual(categoriesAfter.length);
        });
      });
    });

    t.describe('getBadgeCountAsync', () => {
      t.it('resolves with an integer', async () => {
        const badgeCount = await Notifications.getBadgeCountAsync();
        t.expect(typeof badgeCount).toBe('number');
      });
    });

    t.describe('setBadgeCountAsync', () => {
      t.it('resolves with a boolean', async () => {
        const randomCounter = Math.ceil(Math.random() * 9) + 1;
        const result = await Notifications.setBadgeCountAsync(randomCounter);
        t.expect(typeof result).toBe('boolean');
      });

      t.it('sets a retrievable counter (if set succeeds)', async () => {
        const randomCounter = Math.ceil(Math.random() * 9) + 1;
        if (await Notifications.setBadgeCountAsync(randomCounter)) {
          const badgeCount = await Notifications.getBadgeCountAsync();
          t.expect(badgeCount).toBe(randomCounter);
        } else {
          // TODO: add t.pending() when it starts to work
        }
      });

      t.it('clears the counter', async () => {
        const clearingCounter = 0;
        await Notifications.setBadgeCountAsync(clearingCounter);
        const badgeCount = await Notifications.getBadgeCountAsync();
        t.expect(badgeCount).toBe(clearingCounter);
      });
    });

    t.describe('getPresentedNotificationsAsync()', () => {
      const identifier = 'test-containing-id';
      const notificationStatuses = {};

      t.beforeAll(() => {
        Notifications.setNotificationHandler({
          handleNotification: async () => behaviorEnableAll,
          handleSuccess: (notificationId) => {
            notificationStatuses[notificationId] = true;
          },
        });
      });

      t.it('resolves with an array containing a displayed notification', async () => {
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Sample title',
            subtitle: 'What an event!',
            body: 'An interesting event has just happened',
            badge: 1,
          },
          trigger: null,
        });
        await waitFor(1000);
        const displayedNotifications = await Notifications.getPresentedNotificationsAsync();
        t.expect(displayedNotifications).toContain(
          t.jasmine.objectContaining({
            request: t.jasmine.objectContaining({
              identifier,
            }),
          })
        );
      });

      t.it('resolves with an array that does not contain a canceled notification', async () => {
        await Notifications.dismissNotificationAsync(identifier);
        await waitFor(1000);
        const displayedNotifications = await Notifications.getPresentedNotificationsAsync();
        t.expect(displayedNotifications).not.toContain(
          t.jasmine.objectContaining({
            request: t.jasmine.objectContaining({
              identifier,
            }),
          })
        );
      });

      // TODO: Limited this test to Android platform only as only there we have the "Exponent notification"
      if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
        t.it('includes the foreign persistent notification', async () => {
          const displayedNotifications = await Notifications.getPresentedNotificationsAsync();
          t.expect(displayedNotifications).toContain(
            t.jasmine.objectContaining({
              request: t.jasmine.objectContaining({
                identifier: t.jasmine.stringMatching(
                  /^expo-notifications:\/\/foreign_notifications/
                ),
              }),
            })
          );
        });
      }
    });

    t.describe('scheduleNotificationAsync() with null trigger', () => {
      t.it('resolves for a valid notification ID', async () => {
        const identifier = 'test-id';
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'Sample title',
            subtitle: 'What an event!',
            body: 'An interesting event has just happened',
            badge: 1,
          },
          trigger: null,
        });
        await Notifications.dismissNotificationAsync(identifier);
      });

      t.it('resolves for an invalid notification ID', async () => {
        await Notifications.dismissNotificationAsync('no-such-notification-id');
      });
    });

    t.describe('dismissAllNotificationsAsync()', () => {
      t.it('resolves', async () => {
        await Notifications.dismissAllNotificationsAsync();
      });
    });

    t.describe('getAllScheduledNotificationsAsync', () => {
      const identifier = 'test-scheduled-notification';
      const notification = { title: 'Scheduled notification' };

      t.afterEach(async () => {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      });

      t.it('resolves with an Array', async () => {
        const notifications = await Notifications.getAllScheduledNotificationsAsync();
        t.expect(notifications).toEqual(t.jasmine.arrayContaining([]));
      });

      t.it('contains a scheduled notification', async () => {
        const trigger: NotificationTriggerInput = {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10,
        };
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: notification,
          trigger,
        });
        const notifications = await Notifications.getAllScheduledNotificationsAsync();
        t.expect(notifications).toContain(
          t.jasmine.objectContaining({
            identifier,
            content: t.jasmine.objectContaining(notification),
            trigger: t.jasmine.objectContaining({
              repeats: false,
              seconds: trigger.seconds,
              type: 'timeInterval',
            }),
          })
        );
      });

      t.it('does not contain a canceled notification', async () => {
        const trigger: NotificationTriggerInput = {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10,
        };
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: notification,
          trigger,
        });
        await Notifications.cancelScheduledNotificationAsync(identifier);
        const notifications = await Notifications.getAllScheduledNotificationsAsync();
        t.expect(notifications).not.toContain(t.jasmine.objectContaining({ identifier }));
      });
    });

    t.describe('scheduleNotificationAsync', () => {
      const identifier = 'test-scheduled-notification';
      const notificationContent: NotificationContentInput = {
        title: 'Scheduled notification',
        body: 'below title',
        data: { key: 'value' },
        badge: 2,
        vibrate: [100, 100, 100, 100, 100, 100],
        color: '#FF0000',
        sound: 'pop_sound.wav',
      };

      t.afterEach(async () => {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      });

      t.it(
        'triggers a notification which emits an event',
        async () => {
          const notificationReceivedSpy = t.jasmine.createSpy('notificationReceived');
          const subscription =
            Notifications.addNotificationReceivedListener(notificationReceivedSpy);
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notificationContent,
            trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
          });

          await waitFor(6000);
          const platformTrigger =
            Platform.OS === 'android'
              ? {
                  channelId: null,
                }
              : {
                  class: 'UNTimeIntervalNotificationTrigger',
                };

          const platformContent =
            Platform.OS === 'android'
              ? {
                  vibrationPattern: [100, 100, 100, 100, 100, 100],
                  color: '#FFFF0000',
                  autoDismiss: true,
                  sticky: false,
                }
              : {
                  launchImageName: '',
                  categoryIdentifier: '',
                  interruptionLevel: 'active',
                  attachments: [],
                  threadIdentifier: '',
                  targetContentIdentifier: null,
                };

          t.expect(notificationReceivedSpy).toHaveBeenCalledWith({
            date: t.jasmine.any(Number),
            request: {
              trigger: t.jasmine.objectContaining({
                seconds: 5,
                repeats: false,
                type: 'timeInterval',
                ...platformTrigger,
              }),
              content: t.jasmine.objectContaining({
                ...platformContent,
                sound: 'custom',
                title: notificationContent.title,
                body: notificationContent.body,
                subtitle: null,
                badge: 2,
                data: { key: 'value' },
              }),
              identifier,
            },
          });
          subscription.remove();
        },
        10000
      );

      t.it(
        'throws an error if a user defines an invalid trigger (no repeats)',
        async () => {
          let error = undefined;
          try {
            await Notifications.scheduleNotificationAsync({
              identifier,
              content: notificationContent,
              // @ts-expect-error
              trigger: { type: SchedulableTriggerInputTypes.YEARLY, hour: 2, seconds: 5 },
            });
          } catch (err) {
            error = err;
          }
          t.expect(error).toBeDefined();
        },
        10000
      );

      t.it(
        'triggers a notification which triggers the handler (`seconds` trigger)',
        async () => {
          let notificationFromEvent = undefined;
          Notifications.setNotificationHandler({
            handleNotification: async (event) => {
              notificationFromEvent = event;
              return behaviorEnableAll;
            },
          });
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notificationContent,
            trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
          });
          await waitFor(6000);
          t.expect(notificationFromEvent).toBeDefined();
          Notifications.setNotificationHandler(null);
        },
        10000
      );

      t.it(
        'triggers a notification which triggers the handler (with custom sound set, but not existent)',
        async () => {
          let notificationFromEvent = undefined;
          Notifications.setNotificationHandler({
            handleNotification: async (event) => {
              notificationFromEvent = event;
              return behaviorEnableAll;
            },
          });
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
              ...notificationContent,
              sound: 'no-such-file.wav',
            },
            trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
          });
          await waitFor(6000);
          t.expect(notificationFromEvent).toBeDefined();
          t.expect(notificationFromEvent).toEqual(
            t.jasmine.objectContaining({
              request: t.jasmine.objectContaining({
                content: t.jasmine.objectContaining({
                  sound: 'custom',
                }),
              }),
            })
          );
          Notifications.setNotificationHandler(null);
        },
        10000
      );

      t.it(
        'triggers a notification which triggers the handler (`Date` trigger)',
        async () => {
          let notificationFromEvent = undefined;
          Notifications.setNotificationHandler({
            handleNotification: async (event) => {
              notificationFromEvent = event;
              return behaviorEnableAll;
            },
          });
          const trigger: NotificationTriggerInput = {
            type: SchedulableTriggerInputTypes.DATE,
            date: new Date(Date.now() + 5 * 1000),
          };
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notificationContent,
            trigger,
          });
          await waitFor(6000);
          t.expect(notificationFromEvent).toBeDefined();
          Notifications.setNotificationHandler(null);
        },
        10000
      );

      t.it(
        'schedules a repeating daily notification; only first scheduled event is verified.',
        async () => {
          const dateNow = new Date();
          const trigger: NotificationTriggerInput = {
            type: SchedulableTriggerInputTypes.DAILY,
            hour: dateNow.getHours(),
            minute: (dateNow.getMinutes() + 2) % 60,
          };
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notificationContent,
            trigger,
          });
          const result = await Notifications.getAllScheduledNotificationsAsync();

          if (Platform.OS === 'android') {
            t.expect(result[0].trigger).toEqual({
              type: 'daily',
              channelId: null,
              ...trigger,
            });
          } else if (Platform.OS === 'ios') {
            t.expect(result[0].trigger).toEqual({
              type: 'calendar',
              class: 'UNCalendarNotificationTrigger',
              repeats: true,
              dateComponents: {
                ...removeTriggerType(trigger),
                timeZone: null,
                isLeapMonth: false,
                calendar: null,
              },
            });
          } else {
            throw new Error('Test does not support platform');
          }
        },
        4000
      );

      t.it(
        'schedules a repeating weekly notification; only first scheduled event is verified.',
        async () => {
          const dateNow = new Date();
          const trigger: NotificationTriggerInput = {
            type: SchedulableTriggerInputTypes.WEEKLY,
            // JS weekday range equals 0 to 6, Sunday equals 0
            // Native weekday range equals 1 to 7, Sunday equals 1
            weekday: dateNow.getDay() + 1,
            hour: dateNow.getHours(),
            minute: (dateNow.getMinutes() + 2) % 60,
          };
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notificationContent,
            trigger,
          });
          const result = await Notifications.getAllScheduledNotificationsAsync();

          if (Platform.OS === 'android') {
            t.expect(result[0].trigger).toEqual({
              type: 'weekly',
              channelId: null,
              ...trigger,
            });
          } else if (Platform.OS === 'ios') {
            t.expect(result[0].trigger).toEqual({
              type: 'calendar',
              class: 'UNCalendarNotificationTrigger',
              repeats: true,
              dateComponents: {
                ...removeTriggerType(trigger),
                timeZone: null,
                isLeapMonth: false,
                calendar: null,
              },
            });
          } else {
            throw new Error('Test does not support platform');
          }
        },
        4000
      );

      t.it(
        'schedules a repeating yearly notification; only first scheduled event is verified.',
        async () => {
          const dateNow = new Date();
          const trigger: NotificationTriggerInput = {
            type: SchedulableTriggerInputTypes.YEARLY,
            day: dateNow.getDate(),
            month: dateNow.getMonth(), // 0 is January
            hour: dateNow.getHours(),
            minute: (dateNow.getMinutes() + 2) % 60,
          };
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notificationContent,
            trigger,
          });
          const result = await Notifications.getAllScheduledNotificationsAsync();

          if (Platform.OS === 'android') {
            t.expect(result[0].trigger).toEqual({
              type: 'yearly',
              channelId: null,
              ...trigger,
            });
          } else if (Platform.OS === 'ios') {
            t.expect(result[0].trigger).toEqual({
              type: 'calendar',
              class: 'UNCalendarNotificationTrigger',
              repeats: true,
              dateComponents: {
                ...removeTriggerType(trigger),
                // iOS uses 1-12 based months
                month: trigger.month + 1,
                timeZone: null,
                isLeapMonth: false,
                calendar: null,
              },
            });
          } else {
            throw new Error('Test does not support platform');
          }
        },
        4000
      );

      // iOS rejects with "time interval must be at least 60 if repeating"
      // and having a test running for more than 60 seconds may be too
      // time-consuming to maintain
      if (Platform.OS !== 'ios') {
        t.it(
          'triggers a repeating notification which emits events',
          async () => {
            let timesSpyHasBeenCalled = 0;
            const subscription = Notifications.addNotificationReceivedListener(() => {
              timesSpyHasBeenCalled += 1;
            });
            await Notifications.scheduleNotificationAsync({
              identifier,
              content: notificationContent,
              trigger: {
                type: SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: 5,
                repeats: true,
              },
            });
            await waitFor(12000);
            t.expect(timesSpyHasBeenCalled).toBeGreaterThan(1);
            subscription.remove();
          },
          16000
        );
      }

      if (Platform.OS === 'ios') {
        t.it(
          'schedules a notification with calendar trigger',
          async () => {
            const notificationReceivedSpy = t.jasmine.createSpy('notificationReceived');
            const subscription =
              Notifications.addNotificationReceivedListener(notificationReceivedSpy);
            await Notifications.scheduleNotificationAsync({
              identifier,
              content: notificationContent,
              trigger: {
                type: SchedulableTriggerInputTypes.CALENDAR,
                second: (new Date().getSeconds() + 5) % 60,
              },
            });
            await waitFor(6000);
            t.expect(notificationReceivedSpy).toHaveBeenCalled();
            subscription.remove();
          },
          16000
        );
      }
    });

    t.describe('getNextTriggerDateAsync', () => {
      if (Platform.OS === 'ios') {
        t.it('generates trigger date for a calendar trigger', async () => {
          const nextDate = await Notifications.getNextTriggerDateAsync({
            type: SchedulableTriggerInputTypes.CALENDAR,
            month: 1,
            hour: 9,
            repeats: true,
          });
          t.expect(nextDate).not.toBeNull();
        });
      } else {
        t.it('fails to generate trigger date for a calendar trigger', async () => {
          let exception = null;
          try {
            await Notifications.getNextTriggerDateAsync({
              type: SchedulableTriggerInputTypes.CALENDAR,
              month: 1,
              hour: 9,
              repeats: true,
            });
          } catch (e) {
            exception = e;
          }
          t.expect(exception).toBeDefined();
        });
      }

      t.it('generates trigger date for a daily trigger', async () => {
        const nextDate = await Notifications.getNextTriggerDateAsync({
          type: SchedulableTriggerInputTypes.DAILY,
          hour: 9,
          minute: 20,
        });
        t.expect(nextDate).not.toBeNull();
        t.expect(new Date(nextDate).getHours()).toBe(9);
        t.expect(new Date(nextDate).getMinutes()).toBe(20);
      });

      t.it('generates trigger date for a weekly trigger', async () => {
        const nextDateTimestamp = await Notifications.getNextTriggerDateAsync({
          type: SchedulableTriggerInputTypes.WEEKLY,
          weekday: 2,
          hour: 9,
          minute: 20,
        });
        t.expect(nextDateTimestamp).not.toBeNull();
        const nextDate = new Date(nextDateTimestamp);
        // JS has 0 (Sunday) - 6 (Saturday) based week days
        t.expect(nextDate.getDay()).toBe(1);
        t.expect(nextDate.getHours()).toBe(9);
        t.expect(nextDate.getMinutes()).toBe(20);
      });

      t.it('generates trigger date for a yearly trigger', async () => {
        const nextDateTimestamp = await Notifications.getNextTriggerDateAsync({
          type: SchedulableTriggerInputTypes.YEARLY,
          day: 2,
          month: 6,
          hour: 9,
          minute: 20,
        });
        t.expect(nextDateTimestamp).not.toBeNull();
        const nextDate = new Date(nextDateTimestamp);
        t.expect(nextDate.getDate()).toBe(2);
        t.expect(nextDate.getMonth()).toBe(6);
        t.expect(nextDate.getHours()).toBe(9);
        t.expect(nextDate.getMinutes()).toBe(20);
      });

      t.it('fails to generate trigger date for the immediate trigger', async () => {
        let exception = null;
        try {
          // @ts-expect-error invalid arg
          await Notifications.getNextTriggerDateAsync({ channelId: 'test-channel-id' });
        } catch (e) {
          exception = e;
        }
        t.expect(exception).toBeDefined();
      });
    });

    t.describe('cancelScheduledNotificationAsync', () => {
      const identifier = 'test-scheduled-canceled-notification';
      const notification = { title: 'Scheduled, canceled notification' };

      t.it(
        'makes a scheduled notification not trigger',
        async () => {
          const notificationReceivedSpy = t.jasmine.createSpy('notificationReceived');
          const subscription =
            Notifications.addNotificationReceivedListener(notificationReceivedSpy);
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: notification,
            trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
          });
          await Notifications.cancelScheduledNotificationAsync(identifier);
          await waitFor(6000);
          t.expect(notificationReceivedSpy).not.toHaveBeenCalled();
          subscription.remove();
        },
        10000
      );
    });

    t.describe('cancelAllScheduledNotificationsAsync', () => {
      const notification = { title: 'Scheduled, canceled notification' };

      t.it(
        'removes all scheduled notifications',
        async () => {
          const notificationReceivedSpy = t.jasmine.createSpy('notificationReceived');
          const subscription =
            Notifications.addNotificationReceivedListener(notificationReceivedSpy);
          for (let i = 0; i < 3; i += 1) {
            await Notifications.scheduleNotificationAsync({
              identifier: `notification-${i}`,
              content: notification,
              trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
            });
          }
          await Notifications.cancelAllScheduledNotificationsAsync();
          await waitFor(6000);
          t.expect(notificationReceivedSpy).not.toHaveBeenCalled();
          subscription.remove();
          const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
          t.expect(scheduledNotifications.length).toEqual(0);
        },
        10000
      );
    });

    onlyInteractiveDescribe('when the app is in background', () => {
      let subscription: EventSubscription = null;
      let handleNotificationSpy = null;
      let handleSuccessSpy = null;
      let handleErrorSpy = null;
      let notificationReceivedSpy = null;

      t.beforeEach(async () => {
        handleNotificationSpy = t.jasmine.createSpy('handleNotificationSpy');
        handleSuccessSpy = t.jasmine.createSpy('handleSuccessSpy');
        handleErrorSpy = t.jasmine.createSpy('handleErrorSpy').and.callFake((...args) => {
          console.log(args);
        });
        notificationReceivedSpy = t.jasmine.createSpy('notificationReceivedSpy');
        Notifications.setNotificationHandler({
          handleNotification: handleNotificationSpy,
          handleSuccess: handleSuccessSpy,
          handleError: handleErrorSpy,
        });
        subscription = Notifications.addNotificationReceivedListener(notificationReceivedSpy);
      });

      t.afterEach(() => {
        if (subscription) {
          subscription.remove();
          subscription = null;
        }
        Notifications.setNotificationHandler(null);
        handleNotificationSpy = null;
        handleSuccessSpy = null;
        handleErrorSpy = null;
        notificationReceivedSpy = null;
      });

      t.it(
        'shows the notification',
        // without async-await the code is executed immediately after opening the screen
        async () =>
          await new Promise((resolve, reject) => {
            const secondsToTimeout = 5;
            let notificationSent = false;
            Alert.alert(`Please move the app to the background and wait for 5 seconds`);
            let userInteractionTimeout = null;
            let subscription = null;
            async function handleStateChange(state) {
              const identifier = 'test-interactive-notification';
              if (state === 'background' && !notificationSent) {
                if (userInteractionTimeout) {
                  clearInterval(userInteractionTimeout);
                  userInteractionTimeout = null;
                }
                await Notifications.scheduleNotificationAsync({
                  identifier,
                  content: {
                    title: 'Hello from the application!',
                    body: 'You can now return to the app and let the test know the notification has been shown.',
                  },
                  trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
                });
                notificationSent = true;
              } else if (state === 'active' && notificationSent) {
                const notificationWasShown = await askUserYesOrNo('Was the notification shown?');
                t.expect(notificationWasShown).toBeTruthy();
                t.expect(handleNotificationSpy).not.toHaveBeenCalled();
                t.expect(handleSuccessSpy).not.toHaveBeenCalled();
                t.expect(handleErrorSpy).not.toHaveBeenCalledWith(identifier);
                t.expect(notificationReceivedSpy).not.toHaveBeenCalled();
                if (subscription != null) {
                  subscription.remove();
                  subscription = null;
                }
                resolve(undefined);
              }
            }
            userInteractionTimeout = setTimeout(() => {
              console.warn(
                "Scheduled notification test was skipped and marked as successful. It required user interaction which hasn't occured in time."
              );
              if (subscription != null) {
                subscription.remove();
                subscription = null;
              }
              Alert.alert(
                'Scheduled notification test was skipped',
                `The test required user interaction which hasn't occurred in time (${secondsToTimeout} seconds). It has been marked as passing. Better luck next time!`
              );
              resolve(undefined);
            }, secondsToTimeout * 1000);
            subscription = AppState.addEventListener('change', handleStateChange);
          }),
        30000
      );
    });

    onlyInteractiveDescribe('tapping on a notification', () => {
      let subscription = null;
      let event = null;

      t.beforeEach(async () => {
        Notifications.setNotificationHandler({
          handleNotification: async () => behaviorEnableAll,
        });
        subscription = Notifications.addNotificationResponseReceivedListener((anEvent) => {
          event = anEvent;
        });
      });

      t.afterEach(() => {
        if (subscription) {
          subscription.remove();
          subscription = null;
        }
        Notifications.setNotificationHandler(null);
        event = null;
      });

      t.it(
        'calls the "notification response received" listener with default action identifier',
        async () => {
          const secondsToTimeout = 5;
          const shouldRun = await Promise.race([
            askUserYesOrNo('Could you tap on the next notification when it shows?'),
            waitFor(secondsToTimeout * 1000),
          ]);
          if (!shouldRun) {
            console.warn(
              "Notification response test was skipped and marked as successful. It required user interaction which hasn't occured in time."
            );
            Alert.alert(
              'Notification response test was skipped',
              `The test required user interaction which hasn't occurred in time (${secondsToTimeout} seconds). It has been marked as passing. Better luck next time!`
            );
            return;
          }
          const notificationSpec = {
            title: 'Tap me!',
            body: 'Better be quick!',
          };
          await Notifications.scheduleNotificationAsync({
            content: notificationSpec,
            trigger: null,
          });
          await waitUntil(() => !!event);
          t.expect(event).not.toBeNull();
          t.expect(event.actionIdentifier).toBe(Notifications.DEFAULT_ACTION_IDENTIFIER);
          t.expect(event.notification).toEqual(
            t.jasmine.objectContaining({
              request: t.jasmine.objectContaining({
                content: t.jasmine.objectContaining(notificationSpec),
              }),
            })
          );
          t.expect(event).toEqual(await Notifications.getLastNotificationResponseAsync());
        },
        10000
      );
    });

    onlyInteractiveDescribe(
      'triggers a repeating daily notification. only first scheduled event is awaited and verified.',
      () => {
        let timesSpyHasBeenCalled = 0;
        const identifier = 'test-scheduled-notification';
        const notification = {
          title: 'Scheduled notification',
          data: { key: 'value' },
          badge: 2,
          vibrate: [100, 100, 100, 100, 100, 100],
          color: '#FF0000',
        };

        t.beforeEach(async () => {
          await Notifications.cancelAllScheduledNotificationsAsync();
          Notifications.setNotificationHandler({
            handleNotification: async () => {
              timesSpyHasBeenCalled += 1;
              return behaviorEnableAll;
            },
          });
        });

        t.afterEach(async () => {
          Notifications.setNotificationHandler(null);
          await Notifications.cancelAllScheduledNotificationsAsync();
        });

        t.it(
          '[long-running] triggers a repeating daily notification. only first event is verified.',
          async () => {
            // On iOS because we are using the calendar with repeat, it needs to be
            // greater than 60 seconds
            const triggerDate = new Date(
              new Date().getTime() + (Platform.OS === 'ios' ? 120001 : 60000)
            );
            const trigger: DailyTriggerInput = {
              type: SchedulableTriggerInputTypes.DAILY,
              hour: triggerDate.getHours(),
              minute: triggerDate.getMinutes(),
            };
            await Notifications.scheduleNotificationAsync({
              identifier,
              content: notification,
              trigger,
            });
            const scheduledTime = new Date(triggerDate);
            scheduledTime.setSeconds(0);
            scheduledTime.setMilliseconds(0);
            const milliSecondsToWait = scheduledTime.getTime() - new Date().getTime() + 2000;
            await waitFor(milliSecondsToWait);
            t.expect(timesSpyHasBeenCalled).toBe(1);
          },
          200000
        );
      }
    );

    onlyInteractiveDescribe(
      '[long-running] triggers a repeating weekly notification. only first scheduled event is awaited and verified.',
      () => {
        let timesSpyHasBeenCalled = 0;
        const identifier = 'test-scheduled-notification';
        const notification = {
          title: 'Scheduled notification',
          data: { key: 'value' },
          badge: 2,
          vibrate: [100, 100, 100, 100, 100, 100],
          color: '#FF0000',
        };

        t.beforeEach(async () => {
          await Notifications.cancelAllScheduledNotificationsAsync();
          Notifications.setNotificationHandler({
            handleNotification: async () => {
              timesSpyHasBeenCalled += 1;
              return behaviorEnableAll;
            },
          });
        });

        t.afterEach(async () => {
          Notifications.setNotificationHandler(null);
          await Notifications.cancelAllScheduledNotificationsAsync();
        });

        t.it(
          '[long-running] triggers a repeating weekly notification. only first event is verified.',
          async () => {
            // On iOS because we are using the calendar with repeat, it needs to be
            // greater than 60 seconds
            const triggerDate = new Date(
              new Date().getTime() + (Platform.OS === 'ios' ? 120001 : 60000)
            );
            await Notifications.scheduleNotificationAsync({
              identifier,
              content: notification,
              trigger: {
                type: SchedulableTriggerInputTypes.WEEKLY,
                // JS weekday range equals 0 to 6, Sunday equals 0
                // Native weekday range equals 1 to 7, Sunday equals 1
                weekday: triggerDate.getDay() + 1,
                hour: triggerDate.getHours(),
                minute: triggerDate.getMinutes(),
              },
            });
            const scheduledTime = new Date(triggerDate);
            scheduledTime.setSeconds(0);
            scheduledTime.setMilliseconds(0);
            const milliSecondsToWait = scheduledTime.getTime() - new Date().getTime() + 2000;
            await waitFor(milliSecondsToWait);
            t.expect(timesSpyHasBeenCalled).toBe(1);
          },
          140000
        );
      }
    );

    onlyInteractiveDescribe(
      '[long-running] triggers a repeating yearly notification. only first scheduled event is awaited and verified.',
      () => {
        let timesSpyHasBeenCalled = 0;
        const identifier = 'test-scheduled-notification';
        const notification = {
          title: 'Scheduled notification',
          data: { key: 'value' },
          badge: 2,
          vibrate: [100, 100, 100, 100, 100, 100],
          color: '#FF0000',
        };

        t.beforeEach(async () => {
          await Notifications.cancelAllScheduledNotificationsAsync();
          Notifications.setNotificationHandler({
            handleNotification: async () => {
              timesSpyHasBeenCalled += 1;
              return behaviorEnableAll;
            },
          });
        });

        t.afterEach(async () => {
          Notifications.setNotificationHandler(null);
          await Notifications.cancelAllScheduledNotificationsAsync();
        });

        t.it(
          'triggers a repeating yearly notification. only first event is verified.',
          async () => {
            // On iOS because we are using the calendar with repeat, it needs to be
            // greater than 60 seconds
            const triggerDate = new Date(
              new Date().getTime() + (Platform.OS === 'ios' ? 120001 : 60000)
            );
            await Notifications.scheduleNotificationAsync({
              identifier,
              content: notification,
              trigger: {
                type: SchedulableTriggerInputTypes.YEARLY,
                day: triggerDate.getDate(),
                month: triggerDate.getMonth(),
                hour: triggerDate.getHours(),
                minute: triggerDate.getMinutes(),
              },
            });
            const scheduledTime = new Date(triggerDate);
            scheduledTime.setSeconds(0);
            scheduledTime.setMilliseconds(0);
            const milliSecondsToWait = scheduledTime.getTime() - new Date().getTime() + 2000;
            await waitFor(milliSecondsToWait);
            t.expect(timesSpyHasBeenCalled).toBe(1);
          },
          140000
        );
      }
    );
  });
}

// In this test app we contact the Expo push service directly. You *never*
// should do this in a real app. You should always store the push tokens on your
// own server or use the local notification API if you want to notify this user.
const PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

async function sendTestPushNotification(
  expoPushToken: string,
  notificationOverrides?: Record<string, string>
) {
  // POST the token to the Expo push server
  const response = await fetch(PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      // No specific channel ID forces the package to create a fallback channel
      // to present the notification on newer Android devices. One of the tests
      // ensures that the fallback channel is created.
      {
        to: expoPushToken,
        title: 'Hello from Expo server!',
        data: {
          fieldTestedInDataContentsTest: 42, // <- it's true, do not remove it
          firstLevelString: 'value',
          firstLevelObject: {
            secondLevelInteger: 2137,
            secondLevelObject: {
              thirdLevelList: [21, 3, 1995, null, 4, 15],
              thirdLevelNull: null,
            },
          },
        },
        ...notificationOverrides,
      },
    ]),
  });

  const result = await response.json();
  if (result.errors) {
    for (const error of result.errors) {
      console.warn(`API error sending push notification:`, error);
    }
    throw new Error('API error has occurred.');
  }

  const receipts = result.data;
  if (receipts) {
    const receipt = receipts[0];
    if (receipt.status === 'error') {
      if (receipt.details) {
        console.warn(
          `Expo push service reported an error sending a notification: ${receipt.details.error}`
        );
      }
      if (receipt.__debug) {
        console.warn(receipt.__debug);
      }
      throw new Error(`API error has occurred: ${receipt.details.error}`);
    }
  }
}

function askUserYesOrNo(title, message = '') {
  return new Promise((resolve, reject) => {
    try {
      Alert.alert(
        title,
        message,
        [
          {
            text: 'No',
            onPress: () => resolve(false),
          },
          {
            text: 'Yes',
            onPress: () => resolve(true),
          },
        ],
        { onDismiss: () => resolve(false) }
      );
    } catch (e) {
      reject(e);
    }
  });
}

const waitUntil = async (shouldBreak: () => boolean, maxIterations = 5) => {
  let iterations = 0;
  while (iterations < maxIterations) {
    iterations += 1;
    if (shouldBreak()) {
      break;
    }
    await waitFor(1000);
  }
};

const removeTriggerType = (trigger: SchedulableNotificationTriggerInput) => {
  const { type, ...rest } = trigger;
  return rest;
};
