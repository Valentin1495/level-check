import { createRoute } from '@granite-js/react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  calculateAssessmentResult,
  EDU_LEVEL_STEPS,
  getLevelAllowedMisses,
  getLevelQuestionCount,
  SUBJECT_OPTIONS,
  type AssessmentResult,
  type AssessmentStageResult,
  type EducationLevelKey,
  type SubjectKey,
} from '../domain/assessment';
import { fetchAssessmentQuestions, type AssessmentQuestion } from '../lib/feed-client';
import { resolveUserKey, type ResolvedUserKey } from '../lib/user-key';

export const Route = createRoute('/', {
  component: Page,
});

type ScreenState = 'subject' | 'loading' | 'playing' | 'stage_result' | 'final' | 'error';

type StageOutcome = {
  answered: number;
  correct: number;
  failed: boolean;
  misses: number;
};

type CheatSheetMode = 'options' | 'hint';

type PostSubmitAction =
  | { type: 'next_question' }
  | { type: 'stage_result' }
  | { type: 'final'; results: AssessmentStageResult[] };

type SpringPressableProps = {
  children: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
};

const SpringPressable = ({ children, disabled, style, onPress }: SpringPressableProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (value: number) => {
      Animated.spring(scale, {
        toValue: value,
        speed: 34,
        bounciness: 8,
        useNativeDriver: true,
      }).start();
    },
    [scale]
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animateTo(0.96)}
        onPressOut={() => animateTo(1)}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

function Page() {
  const swipePosition = useRef(new Animated.ValueXY()).current;
  const cardEntrance = useRef(new Animated.Value(1)).current;
  const feedbackMotion = useRef(new Animated.Value(0)).current;
  const stageRewardScale = useRef(new Animated.Value(1)).current;
  const resultBadgeScale = useRef(new Animated.Value(0.9)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [screen, setScreen] = useState<ScreenState>('subject');
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey | null>(null);
  const [userKey, setUserKey] = useState<ResolvedUserKey | null>(null);
  const [isSwipingQuestionCard, setIsSwipingQuestionCard] = useState(false);
  const [isQuestionSheetVisible, setIsQuestionSheetVisible] = useState(false);
  const [cheatSheetMode, setCheatSheetMode] = useState<CheatSheetMode>('options');
  const [hasUsedHint, setHasUsedHint] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [hiddenChoiceIds, setHiddenChoiceIds] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);

  const [stageAnswered, setStageAnswered] = useState(0);
  const [stageCorrect, setStageCorrect] = useState(0);
  const [stageMisses, setStageMisses] = useState(0);

  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [stageResults, setStageResults] = useState<AssessmentStageResult[]>([]);
  const [stageOutcome, setStageOutcome] = useState<StageOutcome | null>(null);
  const [finalResult, setFinalResult] = useState<AssessmentResult | null>(null);
  const [sessionBestElo, setSessionBestElo] = useState<number | null>(null);
  const [previousResult, setPreviousResult] = useState<AssessmentResult | null>(null);
  const [displayedResult, setDisplayedResult] = useState<AssessmentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRequestIdRef = useRef(0);
  const postSubmitActionRef = useRef<PostSubmitAction>({ type: 'next_question' });

  const currentLevel = EDU_LEVEL_STEPS[Math.min(stageIndex, EDU_LEVEL_STEPS.length - 1)]!;
  const targetQuestionCount = getLevelQuestionCount(currentLevel.key);
  const allowedMisses = getLevelAllowedMisses(currentLevel.key);
  const isLastStage = stageIndex >= EDU_LEVEL_STEPS.length - 1;
  const currentQuestion = questions[questionIndex] ?? null;
  const stageProgressValue =
    screen === 'playing' ? Math.min(1, Math.max(0, stageAnswered / Math.max(1, targetQuestionCount))) : 0;
  const remainingMisses = Math.max(0, allowedMisses - stageMisses);
  const remainingStageCount = Math.max(0, EDU_LEVEL_STEPS.length - stageIndex - 1);
  const nextLevelLabel = EDU_LEVEL_STEPS[Math.min(stageIndex + 1, EDU_LEVEL_STEPS.length - 1)]?.label ?? currentLevel.label;
  const resultDelta = finalResult && previousResult ? finalResult.finalElo - previousResult.finalElo : null;

  const subjectLabel = useMemo(() => {
    return SUBJECT_OPTIONS.find((subject) => subject.key === selectedSubject)?.label ?? '선택 안 됨';
  }, [selectedSubject]);

  const visibleChoices = useMemo(() => {
    if (!currentQuestion) {
      return [];
    }

    return currentQuestion.choices.filter((choice) => !hiddenChoiceIds.includes(choice.id));
  }, [currentQuestion, hiddenChoiceIds]);

  const canUseFiftyFifty = Boolean(currentQuestion && hiddenChoiceIds.length === 0 && currentQuestion.choices.length >= 4);

  const progressBarStyle = useMemo(
    () => ({
      width: progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    }),
    [progressAnim]
  );

  const questionCardAnimatedStyle = useMemo(
    () => ({
      opacity: cardEntrance,
      transform: [
        {
          translateY: cardEntrance.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
        {
          translateX: feedbackMotion.interpolate({
            inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
            outputRange: [0, -8, 8, -5, 5, 0],
          }),
        },
        {
          scale: feedbackMotion.interpolate({
            inputRange: [0, 0.45, 1],
            outputRange: [1, 1.018, 1],
          }),
        },
        { translateX: swipePosition.x },
        {
          rotate: swipePosition.x.interpolate({
            inputRange: [-160, 0, 160],
            outputRange: ['-5deg', '0deg', '5deg'],
            extrapolate: 'clamp',
          }),
        },
      ],
    }),
    [cardEntrance, feedbackMotion, swipePosition.x]
  );

  const resetQuestionState = useCallback(() => {
    setQuestions([]);
    setQuestionIndex(0);
    setSelectedChoiceId(null);
    setHiddenChoiceIds([]);
    setHasUsedHint(false);
    setHasSubmitted(false);
    setLastAnswerCorrect(null);
    postSubmitActionRef.current = { type: 'next_question' };
    setStageAnswered(0);
    setStageCorrect(0);
    setStageMisses(0);
    setStageOutcome(null);
  }, []);

  const getOrResolveUserKey = useCallback(async () => {
    if (userKey) {
      return userKey;
    }
    const resolved = await resolveUserKey();
    setUserKey(resolved);
    return resolved;
  }, [userKey]);

  const loadStageQuestions = useCallback(
    async (targetStageIndex: number, subject: SubjectKey, excluded: string[]) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;

      setScreen('loading');
      setErrorMessage(null);
      resetQuestionState();

      try {
        const resolvedUserKey = await getOrResolveUserKey();
        let foundQuestions: AssessmentQuestion[] | null = null;
        let resolvedStageIndex = targetStageIndex;

        for (let idx = targetStageIndex; idx < EDU_LEVEL_STEPS.length; idx += 1) {
          const level = EDU_LEVEL_STEPS[idx]!;
          const levelKey = level.key as EducationLevelKey;
          const limit = Math.max(getLevelQuestionCount(levelKey) * 2, 6);

          const response = await fetchAssessmentQuestions({
            subject,
            eduLevel: levelKey,
            excludeIds: excluded,
            limit,
            userHash: resolvedUserKey.value,
          });

          if (loadRequestIdRef.current !== requestId) {
            return;
          }

          const picked = response.items.slice(0, getLevelQuestionCount(levelKey));
          if (!picked.length) {
            continue;
          }

          foundQuestions = picked;
          resolvedStageIndex = idx;
          break;
        }

        if (!foundQuestions) {
          throw new Error('선택한 과목에서 출제 가능한 문제가 없습니다. 다른 과목으로 시도해주세요.');
        }

        if (resolvedStageIndex !== targetStageIndex) {
          setStageIndex(resolvedStageIndex);
        }

        setQuestions(foundQuestions);
        setScreen('playing');
      } catch (error) {
        if (loadRequestIdRef.current !== requestId) {
          return;
        }
        const message = error instanceof Error ? error.message : '문제를 불러오지 못했습니다.';
        setErrorMessage(message);
        setScreen('error');
      }
    },
    [getOrResolveUserKey, resetQuestionState]
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const resolved = await resolveUserKey();
      if (mounted) {
        setUserKey(resolved);
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const handleStartAssessment = useCallback(async () => {
    if (!selectedSubject) {
      return;
    }

    setStageResults([]);
    setExcludedIds([]);
    setPreviousResult(finalResult);
    setFinalResult(null);
    setStageIndex(0);

    await loadStageQuestions(0, selectedSubject, []);
  }, [finalResult, loadStageQuestions, selectedSubject]);

  const finishAssessment = useCallback(
    (nextResults: AssessmentStageResult[]) => {
      const result = calculateAssessmentResult(nextResults);
      setFinalResult(result);
      setDisplayedResult({
        ...result,
        finalElo: 0,
        topPercent: 0,
        accuracy: 0,
      });
      setSessionBestElo((prev) => Math.max(prev ?? result.finalElo, result.finalElo));
      setScreen('final');
    },
    []
  );

  const handleSubmitAnswer = useCallback(() => {
    if (!currentQuestion || !selectedChoiceId || hasSubmitted) {
      return;
    }

    const isCorrect = selectedChoiceId === currentQuestion.correctChoiceId;
    const nextAnswered = stageAnswered + 1;
    const nextCorrect = stageCorrect + (isCorrect ? 1 : 0);
    const nextMisses = stageMisses + (isCorrect ? 0 : 1);

    setIsQuestionSheetVisible(false);
    setHasSubmitted(true);
    setLastAnswerCorrect(isCorrect);
    setStageAnswered(nextAnswered);
    setStageCorrect(nextCorrect);
    setStageMisses(nextMisses);

    const reachedTargetCount = nextAnswered >= Math.min(targetQuestionCount, questions.length);
    const reachedEndOfLoadedQuestions = questionIndex >= questions.length - 1;
    const failedStage = nextMisses > allowedMisses;
    const finishedStage = failedStage || reachedTargetCount || reachedEndOfLoadedQuestions;

    if (!finishedStage) {
      postSubmitActionRef.current = { type: 'next_question' };
      return;
    }

    const currentLevelKey = currentLevel.key;
    const nextStageResult: AssessmentStageResult = {
      eduLevel: currentLevelKey,
      answered: nextAnswered,
      correct: nextCorrect,
      failed: failedStage,
    };

    const nextResults = [...stageResults, nextStageResult];
    setStageResults(nextResults);

    const solvedQuestionIds = questions.slice(0, nextAnswered).map((question) => question.id);
    if (!failedStage) {
      setExcludedIds((prev) => Array.from(new Set([...prev, ...solvedQuestionIds])));
    }

    setStageOutcome({
      answered: nextAnswered,
      correct: nextCorrect,
      misses: nextMisses,
      failed: failedStage,
    });

    if (failedStage || isLastStage) {
      postSubmitActionRef.current = { type: 'final', results: nextResults };
      return;
    }

    postSubmitActionRef.current = { type: 'stage_result' };
  }, [
    allowedMisses,
    currentLevel.key,
    currentQuestion,
    hasSubmitted,
    isLastStage,
    questionIndex,
    questions,
    selectedChoiceId,
    stageAnswered,
    stageCorrect,
    stageMisses,
    stageResults,
    targetQuestionCount,
  ]);

  const handleMoveToNextQuestion = useCallback(() => {
    if (!hasSubmitted) {
      return;
    }

    const postSubmitAction = postSubmitActionRef.current;
    postSubmitActionRef.current = { type: 'next_question' };
    setIsQuestionSheetVisible(false);
    setSelectedChoiceId(null);
    setHiddenChoiceIds([]);
    setHasSubmitted(false);
    setLastAnswerCorrect(null);

    if (postSubmitAction.type === 'final') {
      finishAssessment(postSubmitAction.results);
      return;
    }

    if (postSubmitAction.type === 'stage_result') {
      setScreen('stage_result');
      return;
    }

    setQuestionIndex((prev) => prev + 1);
  }, [finishAssessment, hasSubmitted]);

  const openCheatSheet = useCallback(() => {
    setCheatSheetMode('options');
    setIsQuestionSheetVisible(true);
  }, []);

  const handleShowHint = useCallback(() => {
    setHasUsedHint(true);
    setCheatSheetMode('hint');
  }, []);

  const handleUseFiftyFifty = useCallback(() => {
    if (!currentQuestion || hiddenChoiceIds.length > 0) {
      return;
    }

    const fallbackEliminateIds = currentQuestion.choices
      .filter((choice) => choice.id !== currentQuestion.correctChoiceId)
      .slice(0, 2)
      .map((choice) => choice.id);
    const eliminateIds =
      currentQuestion.fiftyFiftyEliminateIds.length >= 2
        ? currentQuestion.fiftyFiftyEliminateIds.slice(0, 2)
        : fallbackEliminateIds;

    setHiddenChoiceIds(eliminateIds);
    if (selectedChoiceId && eliminateIds.includes(selectedChoiceId)) {
      setSelectedChoiceId(null);
    }
    setIsQuestionSheetVisible(false);
  }, [currentQuestion, hiddenChoiceIds.length, selectedChoiceId]);

  const settleSwipePosition = useCallback(() => {
    Animated.spring(swipePosition, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start(() => setIsSwipingQuestionCard(false));
  }, [swipePosition]);

  const questionPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const isExpectedDirection = hasSubmitted ? gestureState.dx > 16 : gestureState.dx < -16;
          return isExpectedDirection && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25;
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          const isExpectedDirection = hasSubmitted ? gestureState.dx > 16 : gestureState.dx < -16;
          return isExpectedDirection && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25;
        },
        onPanResponderGrant: () => {
          setIsSwipingQuestionCard(true);
          swipePosition.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          swipePosition.setValue({ x: hasSubmitted ? Math.max(0, gestureState.dx) : Math.min(0, gestureState.dx), y: 0 });
        },
        onPanResponderRelease: (_, gestureState) => {
          const shouldMoveNext = gestureState.dx > 90 || (gestureState.dx > 45 && gestureState.vx > 0.55);
          const shouldOpenSheet = gestureState.dx < -90 || (gestureState.dx < -45 && gestureState.vx < -0.55);

          if (!hasSubmitted && shouldOpenSheet) {
            settleSwipePosition();
            openCheatSheet();
            return;
          }

          if (!hasSubmitted || !shouldMoveNext) {
            settleSwipePosition();
            return;
          }

          Animated.timing(swipePosition, {
            toValue: { x: 420, y: 0 },
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            handleMoveToNextQuestion();
            swipePosition.setValue({ x: 0, y: 0 });
            setIsSwipingQuestionCard(false);
          });
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          settleSwipePosition();
        },
      }),
    [handleMoveToNextQuestion, hasSubmitted, openCheatSheet, settleSwipePosition, swipePosition]
  );

  useEffect(() => {
    swipePosition.setValue({ x: 0, y: 0 });
    setHiddenChoiceIds([]);
    setHasUsedHint(false);
    setCheatSheetMode('options');
    cardEntrance.setValue(0);
    Animated.spring(cardEntrance, {
      toValue: 1,
      speed: 18,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [cardEntrance, questionIndex, swipePosition]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: stageProgressValue,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [progressAnim, stageProgressValue]);

  useEffect(() => {
    if (lastAnswerCorrect === null) {
      feedbackMotion.setValue(0);
      return;
    }

    feedbackMotion.setValue(0);
    Animated.spring(feedbackMotion, {
      toValue: 1,
      speed: lastAnswerCorrect ? 22 : 36,
      bounciness: lastAnswerCorrect ? 10 : 4,
      useNativeDriver: true,
    }).start();
  }, [feedbackMotion, lastAnswerCorrect]);

  useEffect(() => {
    if (screen !== 'stage_result') {
      return;
    }

    stageRewardScale.setValue(0.9);
    Animated.spring(stageRewardScale, {
      toValue: 1,
      speed: 16,
      bounciness: 12,
      useNativeDriver: true,
    }).start();
  }, [screen, stageRewardScale]);

  useEffect(() => {
    if (!finalResult) {
      return;
    }

    resultBadgeScale.setValue(0.86);
    Animated.spring(resultBadgeScale, {
      toValue: 1,
      speed: 14,
      bounciness: 12,
      useNativeDriver: true,
    }).start();

    const start = Date.now();
    const duration = 700;
    const timer = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - start) / duration);
      setDisplayedResult({
        finalElo: Math.round(finalResult.finalElo * ratio),
        topPercent: Math.round(finalResult.topPercent * ratio),
        accuracy: Math.round(finalResult.accuracy * ratio),
        answered: finalResult.answered,
        correct: finalResult.correct,
      });

      if (ratio >= 1) {
        clearInterval(timer);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [finalResult, resultBadgeScale]);

  const handleStartNextStage = useCallback(async () => {
    if (!selectedSubject) {
      return;
    }

    const nextStageIndex = Math.min(stageIndex + 1, EDU_LEVEL_STEPS.length - 1);
    setStageIndex(nextStageIndex);
    const mergedExcludes = Array.from(
      new Set([...excludedIds, ...questions.slice(0, stageAnswered).map((question) => question.id)])
    );
    setExcludedIds(mergedExcludes);

    await loadStageQuestions(nextStageIndex, selectedSubject, mergedExcludes);
  }, [excludedIds, loadStageQuestions, questions, selectedSubject, stageAnswered, stageIndex]);

  const handleRetryLoad = useCallback(async () => {
    if (!selectedSubject) {
      setScreen('subject');
      return;
    }
    await loadStageQuestions(stageIndex, selectedSubject, excludedIds);
  }, [excludedIds, loadStageQuestions, selectedSubject, stageIndex]);

  const handleResetAll = useCallback(() => {
    setIsQuestionSheetVisible(false);
    setScreen('subject');
    setStageIndex(0);
    setExcludedIds([]);
    setStageResults([]);
    setFinalResult(null);
    setErrorMessage(null);
    resetQuestionState();
  }, [resetQuestionState]);

  const handleChangeSubject = useCallback(() => {
    const resetToSubjectSelection = () => {
      setIsQuestionSheetVisible(false);
      setScreen('subject');
      setStageIndex(0);
      setExcludedIds([]);
      setStageResults([]);
      setStageOutcome(null);
      setFinalResult(null);
      setDisplayedResult(null);
      setErrorMessage(null);
      resetQuestionState();
    };

    if (screen === 'playing' || screen === 'stage_result') {
      Alert.alert(
        '과목을 변경할까요?',
        '현재 진행 중인 측정 기록은 사라집니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '변경',
            style: 'destructive',
            onPress: resetToSubjectSelection,
          },
        ]
      );
      return;
    }

    resetToSubjectSelection();
  }, [resetQuestionState, screen]);

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} bounces={false} scrollEnabled={!isSwipingQuestionCard}>
        <Text style={styles.title}>레벨 체크</Text>
        <Text style={styles.subtitle}>3분 안에 내 실력 위치 확인</Text>

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>선택 과목</Text>
            <Text style={styles.metaStrongText}>{subjectLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>현재 단계</Text>
            <Text style={styles.metaStrongText}>
              {currentLevel.label}
              {screen === 'playing' && currentQuestion
                ? ` (${questionIndex + 1}/${Math.min(targetQuestionCount, questions.length)})`
                : ''}
            </Text>
          </View>
          {screen === 'playing' ? (
            <>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, progressBarStyle]} />
              </View>
              <Text style={styles.lossText}>
                정답 {stageCorrect} / 오답 {stageMisses} · 남은 기회 {remainingMisses}개
              </Text>
            </>
          ) : null}
          {screen !== 'subject' && screen !== 'loading' ? (
            <SpringPressable style={styles.changeSubjectButton} onPress={handleChangeSubject}>
              <Text style={styles.changeSubjectText}>과목 변경</Text>
            </SpringPressable>
          ) : null}
        </View>

      {screen === 'subject' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>과목을 고르면 바로 시작해요</Text>
          <Text style={styles.guideText}>
            풀이 중 왼쪽으로 스와이프하면 치트 아이템을 고를 수 있고, 정답 확인 후 오른쪽으로 스와이프하면 다음 문제로 넘어갑니다.
          </Text>
          <View style={styles.subjectWrap}>
            {SUBJECT_OPTIONS.map((subject) => {
              const selected = selectedSubject === subject.key;
              return (
                <SpringPressable
                  key={subject.key}
                  style={[styles.subjectButton, selected ? styles.subjectButtonActive : null]}
                  onPress={() => setSelectedSubject(subject.key)}
                >
                  <Text style={[styles.subjectButtonText, selected ? styles.subjectButtonTextActive : null]}>
                    {subject.label}
                  </Text>
                </SpringPressable>
              );
            })}
          </View>
          {selectedSubject ? (
            <View style={styles.flowPreview}>
              <Text style={styles.flowPreviewText}>초등</Text>
              <Text style={styles.flowArrow}>→</Text>
              <Text style={styles.flowPreviewText}>중등</Text>
              <Text style={styles.flowArrow}>→</Text>
              <Text style={styles.flowPreviewText}>고등</Text>
              <Text style={styles.flowArrow}>→</Text>
              <Text style={styles.flowPreviewText}>대학</Text>
            </View>
          ) : null}
          <SpringPressable
            style={[styles.primaryButton, selectedSubject ? null : styles.disabledButton]}
            onPress={() => {
              void handleStartAssessment();
            }}
            disabled={!selectedSubject}
          >
            <Text style={styles.primaryButtonText}>측정 시작</Text>
          </SpringPressable>
        </View>
      ) : null}

      {screen === 'loading' ? (
        <View style={styles.cardCenter}>
          <ActivityIndicator size="large" color="#0064ff" />
          <Text style={styles.infoText}>문제를 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {screen === 'error' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>문제 로딩 실패</Text>
          <Text style={styles.errorText}>{errorMessage ?? '알 수 없는 오류가 발생했습니다.'}</Text>
          <View style={styles.rowButtons}>
            <SpringPressable
              style={styles.secondaryButton}
              onPress={handleResetAll}
            >
              <Text style={styles.secondaryButtonText}>처음으로</Text>
            </SpringPressable>
            <SpringPressable
              style={styles.primaryButtonInline}
              onPress={() => {
                void handleRetryLoad();
              }}
            >
              <Text style={styles.primaryButtonText}>다시 시도</Text>
            </SpringPressable>
          </View>
        </View>
      ) : null}

      {screen === 'playing' && currentQuestion ? (
        <>
          <Animated.View
            style={[styles.card, styles.questionCard, questionCardAnimatedStyle]}
            {...questionPanResponder.panHandlers}
          >
            {!hasSubmitted ? (
              <Text style={styles.swipeHintText}>← 치트 아이템</Text>
            ) : (
              <Text style={styles.swipeHintText}>오른쪽으로 넘기기 →</Text>
            )}
            <Text style={styles.questionText}>{currentQuestion.prompt}</Text>
            {visibleChoices.map((choice, idx) => {
              const selected = selectedChoiceId === choice.id;
              const isCorrectChoice = hasSubmitted && choice.id === currentQuestion.correctChoiceId;
              const isWrongSelected = hasSubmitted && selected && !isCorrectChoice;

              return (
                <SpringPressable
                  key={choice.id}
                  disabled={hasSubmitted}
                  onPress={() => setSelectedChoiceId(choice.id)}
                  style={[
                    styles.choiceButton,
                    selected ? styles.choiceSelected : null,
                    isCorrectChoice ? styles.choiceCorrect : null,
                    isWrongSelected ? styles.choiceWrong : null,
                  ]}
                >
                  <Text style={styles.choiceText}>{idx + 1}. {choice.text}</Text>
                </SpringPressable>
              );
            })}
            {hiddenChoiceIds.length > 0 ? (
              <Text style={styles.cheatUsedText}>50:50 사용 완료 · 오답 2개 제거</Text>
            ) : null}

            {hasSubmitted ? (
              <View style={styles.feedbackBox}>
                <Text style={lastAnswerCorrect ? styles.successText : styles.errorText}>
                  {lastAnswerCorrect ? '정답입니다.' : '오답입니다.'}
                </Text>
                {currentQuestion.explanation ? (
                  <Text style={styles.feedbackText}>{currentQuestion.explanation}</Text>
                ) : null}
              </View>
            ) : null}

            {!hasSubmitted ? (
              <SpringPressable
                style={[styles.primaryButton, selectedChoiceId ? null : styles.disabledButton]}
                disabled={!selectedChoiceId}
                onPress={handleSubmitAnswer}
              >
                <Text style={styles.primaryButtonText}>정답 확인</Text>
              </SpringPressable>
            ) : null}
          </Animated.View>
        </>
      ) : null}

      {screen === 'stage_result' && stageOutcome ? (
        <Animated.View style={[styles.card, styles.rewardCard, { transform: [{ scale: stageRewardScale }] }]}>
          <Text style={styles.rewardBadge}>단계 통과</Text>
          <Text style={styles.cardTitle}>{currentLevel.label} 단계 통과</Text>
          <Text style={styles.infoText}>정답률 {Math.round((stageOutcome.correct / stageOutcome.answered) * 100)}%</Text>
          <Text style={styles.infoText}>남은 단계 {remainingStageCount}개 · 다음 난이도 {nextLevelLabel}</Text>
          <SpringPressable
            style={styles.primaryButton}
            onPress={() => {
              void handleStartNextStage();
            }}
          >
            <Text style={styles.primaryButtonText}>다음 단계 시작</Text>
          </SpringPressable>
        </Animated.View>
      ) : null}

      {screen === 'final' && finalResult ? (
        <View style={styles.card}>
          <Animated.View style={[styles.resultBadge, { transform: [{ scale: resultBadgeScale }] }]}>
            <Text style={styles.resultBadgeText}>측정 완료</Text>
          </Animated.View>
          <Text style={styles.cardTitle}>내 실력 위치</Text>
          <View style={styles.resultGrid}>
            <View style={styles.resultMetric}>
              <Text style={styles.resultLabel}>최종 ELO</Text>
              <Text style={styles.resultNumber}>{displayedResult?.finalElo ?? finalResult.finalElo}</Text>
            </View>
            <View style={styles.resultMetric}>
              <Text style={styles.resultLabel}>상위 추정</Text>
              <Text style={styles.resultNumber}>{displayedResult?.topPercent ?? finalResult.topPercent}%</Text>
            </View>
            <View style={styles.resultMetric}>
              <Text style={styles.resultLabel}>정확도</Text>
              <Text style={styles.resultNumber}>{displayedResult?.accuracy ?? finalResult.accuracy}%</Text>
            </View>
          </View>
          <View style={styles.resultCompareBox}>
            <Text style={styles.resultText}>같은 과목 사용자 기준 상위 {finalResult.topPercent}%</Text>
            <Text style={styles.resultText}>
              {resultDelta === null
                ? '첫 기록 생성 완료'
                : `지난 기록 대비 ${resultDelta >= 0 ? '+' : ''}${resultDelta} ELO`}
            </Text>
            <Text style={styles.resultText}>세션 최고 기록 {sessionBestElo ?? finalResult.finalElo} ELO</Text>
          </View>
          <Text style={styles.resultText}>총 정답/응답: {finalResult.correct}/{finalResult.answered}</Text>

          <View style={styles.divider} />

          {stageResults.map((stage, idx) => {
            const label = EDU_LEVEL_STEPS.find((step) => step.key === stage.eduLevel)?.label ?? stage.eduLevel;
            return (
              <Text style={styles.stageSummaryText} key={`${stage.eduLevel}-${idx}`}>
                {idx + 1}. {label} - {stage.correct}/{stage.answered}
                {stage.failed ? ' (실패)' : ''}
              </Text>
            );
          })}

          <SpringPressable
            style={styles.primaryButton}
            onPress={() => {
              void handleStartAssessment();
            }}
            disabled={!selectedSubject}
          >
            <Text style={styles.primaryButtonText}>다시 측정하기</Text>
          </SpringPressable>
          <SpringPressable style={styles.secondaryFullButton} onPress={handleResetAll}>
            <Text style={styles.secondaryButtonText}>다른 과목 측정</Text>
          </SpringPressable>
        </View>
      ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={isQuestionSheetVisible}
        onRequestClose={() => setIsQuestionSheetVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setIsQuestionSheetVisible(false)}>
          <Pressable style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{cheatSheetMode === 'options' ? '치트 아이템' : '힌트'}</Text>

            {cheatSheetMode === 'options' ? (
              <>
                <SpringPressable
                  style={[styles.cheatOption, hasUsedHint ? styles.cheatOptionUsed : null]}
                  onPress={handleShowHint}
                >
                  <Text style={styles.cheatTitle}>힌트</Text>
                  <Text style={styles.cheatDescription}>
                    {hasUsedHint ? '사용 완료 · 다시 확인할 수 있어요.' : '문제를 푸는 데 도움이 되는 단서를 확인합니다.'}
                  </Text>
                </SpringPressable>
                <SpringPressable
                  style={[
                    styles.cheatOption,
                    hiddenChoiceIds.length > 0 ? styles.cheatOptionUsed : null,
                    canUseFiftyFifty ? null : styles.disabledButton,
                  ]}
                  disabled={!canUseFiftyFifty}
                  onPress={handleUseFiftyFifty}
                >
                  <Text style={styles.cheatTitle}>50:50</Text>
                  <Text style={styles.cheatDescription}>
                    {hiddenChoiceIds.length > 0 ? '사용 완료 · 오답 2개가 제거됐어요.' : '보기 중 오답 2개를 제거합니다.'}
                  </Text>
                </SpringPressable>
              </>
            ) : currentQuestion?.hints.length ? (
              currentQuestion.hints.map((hint, index) => (
                <View style={styles.hintOption} key={`${currentQuestion.id}-hint-${index}`}>
                  <Text style={styles.sheetLabel}>힌트 {index + 1}</Text>
                  <Text style={styles.sheetText}>{hint}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.sheetText}>이 문제에는 아직 등록된 힌트가 없습니다.</Text>
            )}

            <SpringPressable style={styles.primaryButton} onPress={() => setIsQuestionSheetVisible(false)}>
              <Text style={styles.primaryButtonText}>닫기</Text>
            </SpringPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f4f7fb',
    minHeight: '100%',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#334155',
    marginBottom: 16,
    lineHeight: 22,
  },
  metaCard: {
    backgroundColor: '#e9f2ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cde0ff',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#1e293b',
    marginBottom: 4,
  },
  metaStrongText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: '#cde0ff',
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#0064ff',
  },
  lossText: {
    fontSize: 13,
    color: '#0046c9',
    fontWeight: '700',
  },
  changeSubjectButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#b8d6ff',
    backgroundColor: '#ffffff',
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  changeSubjectText: {
    color: '#0046c9',
    fontSize: 13,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f1',
    padding: 16,
    marginBottom: 14,
  },
  cardCenter: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f1',
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  guideText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 14,
  },
  flowPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f1f6ff',
    marginBottom: 8,
  },
  flowPreviewText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
  },
  flowArrow: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '700',
  },
  subjectWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  subjectButton: {
    borderWidth: 1,
    borderColor: '#b8c5d8',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fbff',
  },
  subjectButtonActive: {
    borderColor: '#0064ff',
    backgroundColor: '#e7f0ff',
  },
  subjectButtonText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '600',
  },
  subjectButtonTextActive: {
    color: '#0046c9',
  },
  questionCard: {
    marginBottom: 14,
  },
  swipeHintText: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
  },
  choiceButton: {
    borderWidth: 1,
    borderColor: '#c8d2e1',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#f8fbff',
  },
  choiceSelected: {
    borderColor: '#0064ff',
    backgroundColor: '#eef4ff',
  },
  choiceCorrect: {
    borderColor: '#1a9f53',
    backgroundColor: '#e9f9ef',
  },
  choiceWrong: {
    borderColor: '#e53935',
    backgroundColor: '#ffeceb',
  },
  choiceText: {
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 21,
  },
  cheatUsedText: {
    fontSize: 13,
    color: '#0064ff',
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 8,
  },
  feedbackBox: {
    marginTop: 6,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f6f9ff',
    borderWidth: 1,
    borderColor: '#dce7fb',
  },
  feedbackText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginTop: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 6,
    fontWeight: '600',
  },
  successText: {
    color: '#1a9f53',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#d13232',
    fontWeight: '700',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#d9e1ef',
    marginVertical: 12,
  },
  stageSummaryText: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 6,
  },
  rewardCard: {
    borderColor: '#9ed7b4',
    backgroundColor: '#f3fff7',
  },
  rewardBadge: {
    alignSelf: 'flex-start',
    color: '#138a46',
    backgroundColor: '#dbf8e6',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  resultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e7f0ff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
    marginBottom: 10,
  },
  resultBadgeText: {
    color: '#0046c9',
    fontWeight: '800',
    fontSize: 12,
  },
  resultGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  resultMetric: {
    flex: 1,
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#dbe4f1',
    borderRadius: 10,
    padding: 10,
  },
  resultLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 6,
  },
  resultNumber: {
    fontSize: 20,
    color: '#0f172a',
    fontWeight: '900',
  },
  resultCompareBox: {
    backgroundColor: '#f6f9ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#0064ff',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonInline: {
    backgroundColor: '#0064ff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 120,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 110,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryFullButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#c8d2e1',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  disabledButton: {
    opacity: 0.45,
  },
  rowButtons: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 16,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
  },
  sheetText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
    marginBottom: 16,
  },
  cheatOption: {
    borderWidth: 1,
    borderColor: '#dbe4f1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#f8fbff',
  },
  cheatOptionUsed: {
    borderColor: '#b8d6ff',
    backgroundColor: '#eef6ff',
  },
  cheatTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  cheatDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
  },
  hintOption: {
    marginBottom: 2,
  },
});
