import { contactsViral, isMinVersionSupported, type ContactsViralParams } from '@apps-in-toss/native-modules';

const CONTACTS_VIRAL_MIN_VERSION = {
  android: '5.223.0',
  ios: '5.223.0',
} as const;

type ContactsViralEvent = Parameters<ContactsViralParams['onEvent']>[0];
type ContactsViralRewardEvent = Extract<ContactsViralEvent, { type: 'sendViral' }>;
type ContactsViralCloseEvent = Extract<ContactsViralEvent, { type: 'close' }>;

export type ContactsViralReward = ContactsViralRewardEvent['data'];
export type ContactsViralClose = ContactsViralCloseEvent['data'];

type StartContactsViralRewardShareParams = {
  moduleId: string;
  onReward: (reward: ContactsViralReward) => void;
  onClose?: (close: ContactsViralClose) => void;
  onError?: (error: unknown) => void;
};

export const canUseContactsViralReward = (moduleId: string) => {
  try {
    return Boolean(moduleId.trim()) && isMinVersionSupported(CONTACTS_VIRAL_MIN_VERSION);
  } catch {
    return false;
  }
};

export const startContactsViralRewardShare = ({
  moduleId,
  onReward,
  onClose,
  onError,
}: StartContactsViralRewardShareParams) => {
  const trimmedModuleId = moduleId.trim();

  if (!canUseContactsViralReward(trimmedModuleId)) {
    return false;
  }

  let cleanup: (() => void) | undefined;
  const runCleanup = () => {
    cleanup?.();
    cleanup = undefined;
  };

  try {
    cleanup = contactsViral({
      options: { moduleId: trimmedModuleId },
      onEvent: (event) => {
        if (event.type === 'sendViral') {
          onReward(event.data);
          return;
        }

        onClose?.(event.data);
        runCleanup();
      },
      onError: (error) => {
        onError?.(error);
        runCleanup();
      },
    });

    return true;
  } catch (error) {
    onError?.(error);
    runCleanup();
    return false;
  }
};
