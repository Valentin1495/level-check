import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';

type LoadInterstitialAdParams = {
  adGroupId: string;
  onLoaded: () => void;
  onError?: (error: unknown) => void;
};

type ShowInterstitialAdParams = {
  adGroupId: string;
  onFinished: () => void;
  onError?: (error: unknown) => void;
};

export const canUseInterstitialAd = (adGroupId: string) => {
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

export const loadInterstitialAd = ({ adGroupId, onLoaded, onError }: LoadInterstitialAdParams) => {
  const trimmedAdGroupId = adGroupId.trim();

  if (!canUseInterstitialAd(trimmedAdGroupId)) {
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

export const showInterstitialAd = ({ adGroupId, onFinished, onError }: ShowInterstitialAdParams) => {
  const trimmedAdGroupId = adGroupId.trim();

  if (!canUseInterstitialAd(trimmedAdGroupId)) {
    return false;
  }

  let didFinish = false;
  const finishOnce = () => {
    if (didFinish) {
      return;
    }

    didFinish = true;
    onFinished();
  };

  try {
    let cleanup = () => {};
    cleanup = showFullScreenAd({
      options: { adGroupId: trimmedAdGroupId },
      onEvent: (event) => {
        if (event.type === 'dismissed' || event.type === 'failedToShow') {
          cleanup();
          finishOnce();
        }
      },
      onError: (error) => {
        cleanup();
        onError?.(error);
        finishOnce();
      },
    });

    return true;
  } catch (error) {
    onError?.(error);
    finishOnce();
    return false;
  }
};
