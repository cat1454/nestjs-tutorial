export interface WelcomeEmailJobData {
  recipientEmail: string;
  username: string;
  lang?: string;
}

export interface NewCommentEmailJobData {
  recipientEmail: string;
  recipientUsername: string;
  commenterUsername: string;
  articleTitle: string;
  articleSlug: string;
  commentBody: string;
  lang?: string;
}

export interface DigestArticleSummary {
  title: string;
  slug: string;
  authorUsername: string;
}

export interface DailyDigestEmailJobData {
  recipientEmail: string;
  recipientUsername: string;
  articles: DigestArticleSummary[];
  lang?: string;
}

export interface DailyDigestBulkJobItem {
  data: DailyDigestEmailJobData;
  jobId?: string;
}

export type MailJobData =
  | WelcomeEmailJobData
  | NewCommentEmailJobData
  | DailyDigestEmailJobData;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
