import { loadFullScreenAd, showFullScreenAd, type ShowFullScreenAdEvent } from '@apps-in-toss/framework';

export type RewardedAdReward = Extract<ShowFullScreenAdEvent, { type: 'userEarnedReward' }>['data'];

type LoadRewardedAdParams = {
  adGroupId: string;
  onLoaded: () => void;
  onError?: (error: unknown) => void;
};

type ShowRewardedAdParams = {
  adGroupId: string;
  onReward: (reward: RewardedAdReward) => void;
  onDismissed?: () => void;
  onFailedToShow?: () => void;
  onError?: (error: unknown) => void;
};

export const canUseRewardedAd = (adGroupId: string) => {
  try {
    return (
      Boolean(adGroupId.trim()) &&
      loadFullScreenAd.isSupported() &&
      showFullScreenAd.isSupported()
    );
  } catch {
    return false;
  }
};

export const loadRewardedAd = ({ adGroupId, onLoaded, onError }: LoadRewardedAdParams) => {
  const trimmedAdGroupId = adGroupId.trim();

  if (!canUseRewardedAd(trimmedAdGroupId)) {
    return null;
  }

  try {
    return loadFullScreenAd({
      options: { adGroupId: trimmedAdGroupId },
      onEvent: (event) => {
        if (event.type === 'loaded') {
          onLoaded();
        }
      },
      onError: (error) => {
        onError?.(error);
      },
    });
  } catch (error) {
    onError?.(error);
    return null;
  }
};

export const showRewardedAd = ({
  adGroupId,
  onReward,
  onDismissed,
  onFailedToShow,
  onError,
}: ShowRewardedAdParams) => {
  const trimmedAdGroupId = adGroupId.trim();

  if (!canUseRewardedAd(trimmedAdGroupId)) {
    return false;
  }

  try {
    let cleanup = () => {};
    cleanup = showFullScreenAd({
      options: { adGroupId: trimmedAdGroupId },
      onEvent: (event) => {
        if (event.type === 'userEarnedReward') {
          onReward(event.data);
          return;
        }

        if (event.type === 'dismissed') {
          onDismissed?.();
          cleanup();
          return;
        }

        if (event.type === 'failedToShow') {
          onFailedToShow?.();
          cleanup();
        }
      },
      onError: (error) => {
        onError?.(error);
        cleanup();
      },
    });

    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
};
