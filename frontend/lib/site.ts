/**
 * Marketing content and plan data in one place.
 * Plan limits mirror the quota table in the architecture manual (FR-040 to FR-044).
 * To change a price or a limit on the website, edit it here only.
 */

export const SUPPORT_EMAIL = 'docmindofficial@gmail.com';

export interface PlanLimits {
  docs: number;
  storageMb: number;
  questions: number;
  fileMb: number;
  pages: number;
  uploads: number;
  seats: number;
}

export interface Plan {
  id: 'STARTER' | 'PRO' | 'ENTERPRISE';
  name: string;
  price: number;
  blurb: string;
  cta: string;
  href: string;
  recommended?: boolean;
  limits: PlanLimits;
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: 0,
    blurb: 'For one person trying DocMind on real documents.',
    cta: 'Start free',
    href: '/signup',
    limits: { docs: 20, storageMb: 200, questions: 100, fileMb: 20, pages: 200, uploads: 1, seats: 1 },
    highlights: ['Cited answers and summaries', 'Compare up to 5 documents', 'Personal workspace'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 79,
    blurb: 'For teams that review documents every week.',
    cta: 'Start with Pro',
    href: '/signup',
    recommended: true,
    limits: { docs: 500, storageMb: 10240, questions: 2500, fileMb: 50, pages: 500, uploads: 5, seats: 25 },
    highlights: ['Team workspace with roles', 'Invites and audit log', 'Larger files and more uploads at once'],
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: 299,
    blurb: 'For organizations with large libraries and many reviewers.',
    cta: 'Start with Enterprise',
    href: '/signup',
    limits: { docs: 5000, storageMb: 102400, questions: 25000, fileMb: 100, pages: 2000, uploads: 20, seats: 500 },
    highlights: ['Up to 500 seats', 'Priority processing', 'Security review on request'],
  },
];

export const LIMIT_ROWS: { label: string; key: keyof PlanLimits; format: (n: number) => string }[] = [
  { label: 'Documents', key: 'docs', format: n => n.toLocaleString('en-US') },
  { label: 'Storage', key: 'storageMb', format: n => (n >= 1024 ? `${Math.round(n / 1024)} GB` : `${n} MB`) },
  { label: 'Questions per month', key: 'questions', format: n => n.toLocaleString('en-US') },
  { label: 'File size', key: 'fileMb', format: n => `${n} MB` },
  { label: 'Pages per file', key: 'pages', format: n => n.toLocaleString('en-US') },
  { label: 'Uploads at once', key: 'uploads', format: n => String(n) },
  { label: 'Team seats', key: 'seats', format: n => n.toLocaleString('en-US') },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Will DocMind make things up?',
    a: 'It is built to answer only from passages retrieved from your documents, and every claim carries a citation you can open. When those passages do not contain the answer, it says: "I cannot find sufficient evidence in the uploaded documents to answer this question." No system is perfect, which is why the citations are there for you to check.',
  },
  {
    q: 'Are my documents used to train AI models?',
    a: 'No. DocMind does not use your documents to train models. To write an answer, the passages relevant to your question are sent to Google\'s Gemini API along with the question.',
  },
  {
    q: 'Which file types can I upload?',
    a: 'PDF, Word (.docx), plain text and Markdown. Scanned PDFs are read with OCR automatically, and tables are kept as tables.',
  },
  {
    q: 'Who can do what in a workspace?',
    a: 'Owners manage the plan and billing. Admins manage members and documents and can see the audit log. Members upload documents, ask questions and run comparisons. Viewers can read documents, citations and conversation history.',
  },
  {
    q: 'What happens when I reach a plan limit?',
    a: 'The upload or question is blocked with a message that names the limit. Nothing is deleted. You can upgrade in Settings or wait for the monthly reset.',
  },
  {
    q: 'Can I delete my documents?',
    a: 'Yes, at any time. A deleted document disappears from search and answers immediately, and its stored file is removed in the background. To close your account, email us.',
  },
];

export const SECURITY_POINTS: { icon: 'users' | 'lock' | 'shield' | 'history' | 'file'; title: string; body: string }[] = [
  {
    icon: 'users',
    title: 'Separated by workspace',
    body: 'Every query for documents, passages and messages is filtered by the workspace you are signed in to. A request for another workspace\'s data is rejected.',
  },
  {
    icon: 'lock',
    title: 'Encrypted and private',
    body: 'Traffic uses TLS, data is encrypted at rest, and files sit in private object storage with no public links.',
  },
  {
    icon: 'shield',
    title: 'Careful sign-in',
    body: 'Passwords are hashed with Argon2id. Password reset links work once and expire after 60 minutes.',
  },
  {
    icon: 'history',
    title: 'A record of what happened',
    body: 'Uploads, invitations, deletions and plan changes are logged. Admins can review the log at any time.',
  },
];
