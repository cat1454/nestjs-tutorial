export const MAIL_QUEUE_NAME = 'mail';

export const MAIL_JOB_NAMES = {
  WELCOME: 'send-welcome-email',
  NEW_COMMENT: 'send-new-comment-email',
  DAILY_DIGEST: 'send-daily-digest-email',
} as const;

export const MAIL_JOB_DEFAULT_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: true,
  removeOnFail: 50,
};
