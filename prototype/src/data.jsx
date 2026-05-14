// ============ MOCK DATA ============
// All inline. Same cast appears across pages for consistency.

const CONTACTS = [
  { id: 'C-X4729', name: 'Maria Gonzalez',  phone: '(954) 318-4209', source: 'Estimate Calculator', city: 'Coral Springs',  tags: ['stage:engaged', 'src:estimator', 'P1'] },
  { id: 'C-J1083', name: 'John Patel',      phone: '(954) 226-7741', source: 'HRR',                 city: 'Plantation',    tags: ['stage:curious-mofu', 'src:hrr',       'P1'] },
  { id: 'C-S9942', name: 'Sandra Williams', phone: '(954) 882-3318', source: 'Canvassing',          city: 'Fort Lauderdale',tags: ['stage:tofu',         'src:canvas',    'P1'] },
  { id: 'C-R6611', name: 'Robert Chen',     phone: '(954) 401-2298', source: 'High-Intent Digital', city: 'Weston',        tags: ['stage:comparing',    'src:digital',  'P1'] },
  { id: 'C-J7755', name: 'Jennifer Davis',  phone: '(954) 779-0044', source: 'Referral',            city: 'Davie',         tags: ['stage:negotiating',  'src:referral', 'P1'] },
  { id: 'C-M3382', name: 'Marcus Johnson',  phone: '(954) 555-1820', source: 'Chatbot',             city: 'Pembroke Pines',tags: ['stage:re-engaged',   'src:chatbot',  'P1'] },
  { id: 'C-L8821', name: 'Lisa Rodriguez',  phone: '(954) 612-9974', source: 'Estimate Calculator', city: 'Sunrise',       tags: ['stage:committed',    'P2'] },
  { id: 'C-D2204', name: 'David Thompson',  phone: '(954) 330-7711', source: 'HRR',                 city: 'Hollywood',     tags: ['stage:long-term-hold', 'P3'] },
];

const REPS = ['Carlos M.', 'Tanya R.', 'Jeff B.', 'Priscilla L.'];

// ============ HEADLINE / OVERVIEW ============
const SERVICE_HEALTH = [
  { id: 'lp-mcp', name: 'LP MCP',                 status: 'healthy', label: 'Running',  meta: 'Last deploy 3h ago',
    info: {
      what: 'Lead-platform Model Context Protocol server. Routes inbound events from the website, calculator, and chatbot to the decision engine.',
      where: 'Hosted on Fly.io · /health endpoint polled every 30s · build hash exposed via /version.',
      fix: 'If red: check Fly dashboard for crash loops; redeploy from main if last commit is older than expected.',
    } },
  { id: 'hl-mcp', name: 'HL MCP',                 status: 'healthy', label: 'Running',  meta: 'Last deploy 1d ago',
    info: {
      what: 'Go-High-Level Model Context Protocol bridge. Mirrors contact, tag, and opportunity mutations into Supabase.',
      where: 'Hosted on Fly.io · receives GHL webhooks · writes to public.contact_events.',
      fix: 'If red: GHL webhook is probably revoked. Regenerate webhook secret in GHL → Settings → Integrations.',
    } },
  { id: 'de-tick', name: 'Decision Engine Heartbeat', status: 'warning', label: 'Healthy', meta: 'Last tick 11 min ago',
    info: {
      what: 'The rules engine that fires every minute and evaluates 92 active rules against contact state.',
      where: 'Cron-driven on Supabase Edge Functions · writes one heartbeat row per tick to ops.engine_heartbeat.',
      fix: 'If >10 min stale: check Edge Function logs in Supabase. Most common cause is a stuck rule with no timeout (look at last firing in Agent Layer).',
    } },
  { id: 'sb-sync', name: 'Supabase Sync',         status: 'healthy', label: 'Fresh',    meta: 'Last sync 14 min ago',
    info: {
      what: 'End-to-end freshness probe — writes a row in GHL, watches it appear in Supabase, measures lag.',
      where: 'Probe runs every 5 min · target lag <2 min · alerts if lag >15 min for 3 consecutive probes.',
      fix: 'Check HL MCP first. If HL MCP is green and lag is climbing, GHL is rate-limiting us — back off.',
    } },
];

const HEADLINE_STATS = [
  { id: 'leads',    label: 'Leads today',         value: 27,  delta: '+12% vs yesterday', deltaTone: 'pos',
    info: { what: 'New contacts created in GHL today, deduped by phone and email.',
            where: 'public.contacts filtered to created_at::date = today, source <> ‘import’.',
            fix: 'If suspiciously low before noon: check that LP MCP is receiving estimator submissions (Service Health tile).' } },
  { id: 'appts',    label: 'Appointments today',  value: 8,   delta: '−2 vs yesterday',   deltaTone: 'neg',
    info: { what: 'Booked GHL calendar slots for today across all 4 reps, all appointment types.',
            where: 'GHL calendar API, polled every 10 min · matches calendar IDs in config.calendars.',
            fix: 'If 0: the GHL → Supabase calendar sync probably broke overnight. See HL MCP logs.' } },
  { id: 'inflight', label: 'Opps in flight',      value: 342, delta: '+5 since 9am',      deltaTone: 'pos',
    info: { what: 'Open opportunities across P1 (Antifragile Activation) and P2 (Lifecycle).',
            where: 'public.opportunities WHERE status = ‘open’ AND pipeline_id IN (1,2).',
            fix: 'If it drops by >20 in a day, check Approval Queue — a bad rule may be auto-disqualifying.' } },
  { id: 'pending',  label: 'Pending approvals',   value: 3,   delta: 'oldest 41 min',     deltaTone: 'warn',
    info: { what: 'Decisions the agent layer flagged for human review before executing.',
            where: 'public.approval_queue WHERE state = ‘pending’.',
            fix: 'Open the Approval Queue page. Empty the oldest first — long-pending items mean the rule has the wrong confidence threshold.' } },
  { id: 'issues',   label: 'Open issues',         value: 6,   delta: '2 sev:high',        deltaTone: 'neg',
    info: { what: 'Tracked operational issues across workflows, sync, and data quality.',
            where: 'public.issues — created manually by ops or auto-filed by diagnostics jobs.',
            fix: 'See Issues page. Severity:high items block end-of-day signoff.' } },
];

const ACTIVITY_FEED = [
  { t: '11:47', tone: 'pos',  text: 'Lead created — Maria Gonzalez via Estimate Calculator' },
  { t: '11:45', tone: 'mute', text: 'Action executed — add_tag stage:engaged on contact #C-X4729' },
  { t: '11:42', tone: 'warn', text: 'Approval requested — move_opportunity from Stage 5 → Stage 8 (Reactivation)' },
  { t: '11:38', tone: 'mute', text: 'Workflow E.4 (Canvassing Bridge) entered by contact #C-S9942' },
  { t: '11:31', tone: 'pos',  text: 'Appointment booked — Robert Chen · Window Estimate · Tue 2:30 PM · Carlos M.' },
  { t: '11:24', tone: 'neg',  text: 'Action failed — send_sms to #C-R6611 (twilio 21610: STOP)' },
  { t: '11:18', tone: 'mute', text: 'Rule fired — LP_DISP_FDNS_DEMO_COMPLETE on contact #C-J7755' },
  { t: '11:12', tone: 'pos',  text: 'Opportunity advanced — John Patel · Curious-MOFU → Comparing-BOFU' },
  { t: '11:04', tone: 'mute', text: 'Decision engine tick — 14 rules evaluated, 2 fired, 12 no-op' },
  { t: '10:58', tone: 'warn', text: 'Drift detected — contact #C-D2204 closed in GHL, still LP-active' },
];

const ALERTS = [
  { sev: 'high', title: 'W0.4 Canvassing Bridge UNPUBLISHED', body: 'Spamming booked/sold/DNC contacts — pause the trigger until canonicalized.', age: '38m' },
  { sev: 'high', title: 'workflow_executions table unpopulated', body: 'Observability blind spot — diagnostics jobs run but emit nothing.', age: '2h' },
  { sev: 'med',  title: 'W11.1 still in draft', body: 'Blocks W11.0 exit — contacts stalling in committed stage with no nurture.', age: '6h' },
  { sev: 'med',  title: 'Heartbeat at 11 min', body: 'Decision Engine threshold is 10 min. Single tick — watching.', age: '11m' },
  { sev: 'low',  title: 'Namespace violation × 12', body: 'Contacts carrying conflicting stage:* tags. Auto-fix nightly.', age: '1d' },
];

// ============ PIPELINES ============
const PIPELINES = [
  { id: 'P1', name: 'Antifragile Buyer Activation', count: 342, value: 4200000,
    stages: [
      { name: 'Indifferent',      n: 48, aging: 'green' },
      { name: 'Curious-TOFU',     n: 54, aging: 'green' },
      { name: 'Re-engagement',    n: 38, aging: 'amber' },
      { name: 'Curious-MOFU',     n: 42, aging: 'green' },
      { name: 'Comparing-BOFU',   n: 36, aging: 'green' },
      { name: 'Solution Pitch',   n: 28, aging: 'amber' },
      { name: 'Negotiating',      n: 21, aging: 'amber' },
      { name: 'Committed',        n: 14, aging: 'rose'  },
      { name: 'Hard Disqualified',n: 19, aging: 'green' },
      { name: 'Reactivation',     n: 17, aging: 'rose'  },
      { name: 'Long-Term Hold',   n: 18, aging: 'amber' },
      { name: 'Closed',           n:  7, aging: 'green' },
    ],
    info: {
      what: 'The main acquisition pipeline. Every net-new lead enters here; opportunities advance through 12 stages from indifference to closed-won.',
      where: 'public.opportunities WHERE pipeline_id = 1. Stage transitions are emitted by GHL and mirrored.',
      fix: 'If a stage balloons (>1.5× baseline) check Workflows tab for that family. Look for wait_bottleneck or message overlap.',
    } },
  { id: 'P2', name: 'Client Lifecycle',  count: 168, value: 2100000,
    stages: [
      { name: 'Onboarding',         n: 32, aging: 'green' },
      { name: 'Pre-Install',        n: 28, aging: 'green' },
      { name: 'Install Scheduled',  n: 24, aging: 'amber' },
      { name: 'Install Complete',   n: 22, aging: 'green' },
      { name: 'Punch List',         n: 14, aging: 'amber' },
      { name: 'Warranty Active',    n: 28, aging: 'green' },
      { name: 'Referral Window',    n: 12, aging: 'green' },
      { name: 'Closed',             n:  8, aging: 'green' },
    ],
    info: {
      what: 'Post-sale customer journey — onboarding, install, warranty, referral.',
      where: 'public.opportunities WHERE pipeline_id = 2.',
      fix: 'Most issues here are calendar drift. Cross-check Install Scheduled count against Appointments page.',
    } },
  { id: 'P3', name: 'Recycle / Lost / Deferred', count: 89, value: 890000,
    stages: [
      { name: 'Cold Lost',        n: 22, aging: 'green' },
      { name: 'Price Lost',       n: 14, aging: 'amber' },
      { name: 'Competitor Lost',  n:  9, aging: 'amber' },
      { name: 'Deferred 90d',     n: 18, aging: 'rose'  },
      { name: 'Deferred 180d',    n: 16, aging: 'amber' },
      { name: 'Hard DNC',         n: 10, aging: 'green' },
    ],
    info: {
      what: 'Holding pipeline for everything that didn’t close. Contacts move out via the 90-day re-engagement workflow (S1.1).',
      where: 'public.opportunities WHERE pipeline_id = 3.',
      fix: 'If Deferred 90d > 25, S1.1 is throttled. Check Workflows for a wait bottleneck on S1.1.',
    } },
];

// ============ WORKFLOWS ============
const WORKFLOW_FAMILIES = ['E.x', 'S1.x', 'S2.x', 'S3.x', 'S4.x', 'S5.x', 'L.x', 'O.x', 'A.x', 'B.x', 'C.x', 'F.x'];

const WORKFLOWS = [
  { code: 'S5.2', name: 'Appointment Rescue Reactivation',       status: 'Published', mod: '6d ago',   badges: [] },
  { code: 'S1.1', name: '90-Day Re-engagement',                   status: 'Published', mod: '2w ago',   badges: ['wait bottleneck'] },
  { code: 'E.4',  name: 'Canvassing Bridge',                      status: 'Published', mod: '1d ago',   badges: [] },
  { code: 'W11.1',name: 'TBD',                                    status: 'Draft',     mod: '1mo ago',  badges: ['dead'] },
  { code: 'S2.1', name: 'Estimator → Demo Confirm',               status: 'Published', mod: '4d ago',   badges: ['duplicate trigger'] },
  { code: 'S3.1', name: 'HRR Intake Nurture',                     status: 'Published', mod: '11d ago',  badges: [] },
  { code: 'S4.2', name: 'BOFU Pricing Drip',                      status: 'Published', mod: '8d ago',   badges: ['message overlap'] },
  { code: 'S4.5', name: 'Solution Pitch Followup',                status: 'Draft',     mod: '3w ago',   badges: [] },
  { code: 'L.4',  name: 'Long-Term Hold Touchpoint',              status: 'Published', mod: '5d ago',   badges: ['wait bottleneck', 'message overlap'] },
  { code: 'A.1',  name: 'Install Day Confirmation',               status: 'Published', mod: '2d ago',   badges: [] },
  { code: 'B.1',  name: 'Warranty Activation',                    status: 'Published', mod: '9d ago',   badges: [] },
  { code: 'C.1',  name: 'Referral Window Invite',                 status: 'Published', mod: '12d ago',  badges: ['duplicate trigger'] },
  { code: 'S1.2', name: 'Re-engagement Cold Branch',              status: 'Dead',      mod: '2mo ago',  badges: ['dead'] },
  { code: 'F.1',  name: 'Final DNC Honor',                        status: 'Published', mod: '20d ago',  badges: [] },
];

const WORKFLOW_STATS = { total: 87, published: 64, draft: 23, dead: 4, duplicates: 7 };

// ============ DIAGNOSTICS ============
const DIAG = {
  dead: {
    last: '08:14 today',
    rows: [
      { code: 'W11.1', name: 'TBD', reason: 'no enter events in 30d' },
      { code: 'S1.2', name: 'Re-engagement Cold Branch', reason: 'replaced by S1.1 v3' },
      { code: 'W14.0', name: 'Estimate Calculator Bridge (old)', reason: 'superseded by E.4' },
      { code: 'W7.3',  name: 'Holiday Pause 2024', reason: 'expired calendar window' },
    ],
  },
  duplicates: {
    last: '08:14 today',
    rows: [
      { code: 'S2.1', trigger: 'tag added: estimate_complete', conflict: 'also triggers W14.0' },
      { code: 'C.1',  trigger: 'opportunity moved: → Warranty Active', conflict: 'also triggers C.2' },
      { code: 'A.1',  trigger: 'tag added: install_scheduled', conflict: 'also fires A.0 (deprecated)' },
      { code: 'E.4',  trigger: 'tag added: canvassed', conflict: 'also fires W0.4 (UNPUBLISHED)' },
      { code: 'S3.1', trigger: 'form_submission: HRR', conflict: 'also fires S3.2 demo branch' },
      { code: 'L.4',  trigger: 'tag added: long_term_hold', conflict: 'also fires L.3' },
      { code: 'B.1',  trigger: 'opportunity moved: → Warranty Active', conflict: 'duplicate with C.1' },
    ],
  },
  overlap: {
    last: '08:14 today',
    rows: [
      { code: 'S4.2', overlap: 'Same SMS body within 36h of S4.5' },
      { code: 'L.4',  overlap: 'L.3 sends identical "checking in" email at +5d' },
      { code: 'S1.1', overlap: 'Day-7 voicemail overlaps S2.1 re-confirm' },
    ],
  },
  waits: {
    last: '08:14 today',
    rows: [
      { code: 'S1.1', step: 'Day 30 wait', stuck: 88, avg: '34d' },
      { code: 'L.4',  step: 'Long Term Hold +90d', stuck: 62, avg: '102d' },
      { code: 'S4.2', step: 'BOFU drip wait #3', stuck: 41, avg: '12d' },
      { code: 'S2.1', step: 'Reminder gap 48h', stuck: 18, avg: '3d' },
      { code: 'A.1',  step: 'Day-of-install confirm window', stuck: 9,  avg: '8h' },
    ],
  },
  circular: { last: '08:14 today', rows: [] },
  namespace: {
    last: '08:14 today',
    rows: [
      { contact: 'C-X4729', tags: 'stage:engaged + stage:tofu' },
      { contact: 'C-J1083', tags: 'stage:curious-mofu + stage:reactivation' },
      { contact: 'C-S9942', tags: 'src:canvas + src:digital' },
      { contact: 'C-R6611', tags: 'stage:comparing + stage:hard_dq' },
      { contact: 'C-J7755', tags: 'stage:negotiating + stage:closed' },
      { contact: 'C-M3382', tags: 'stage:re-engaged + stage:tofu' },
      { contact: 'C-L8821', tags: 'stage:committed + stage:warranty' },
      { contact: 'C-D2204', tags: 'stage:long-term-hold + stage:closed' },
      { contact: 'C-K0102', tags: 'src:hrr + src:referral' },
      { contact: 'C-V8819', tags: 'stage:tofu + stage:hard_dq' },
      { contact: 'C-T4471', tags: 'stage:comparing + stage:re-engaged' },
      { contact: 'C-N9921', tags: 'stage:committed + stage:long-term-hold' },
    ],
  },
};

// ============ AGENT LAYER ============
const AGENT_TILES = {
  active: 92, inactive: 14, queued: 8, exec24: 1247, failed: 3, heartbeat: '2 min ago',
};

// 24 hourly buckets
const AGENT_SERIES = (() => {
  const base = [12,9,7,5,4,3,3,4,9,18,34,52,68,79,84,91,88,76,61,49,38,27,21,15];
  return base.map((s, i) => ({ hour: `${i.toString().padStart(2,'0')}:00`, success: s, fail: Math.max(0, Math.round(Math.random()*1.5) + (i===6||i===14?1:0)) }));
})();

const RULE_FIRINGS = [
  { rule: 'LP_DISP_FDNS_DEMO_COMPLETE', contact: 'C-X4729', ago: '4 min ago', action: 'add_to_workflow W8.0' },
  { rule: 'BEHAVIORAL_STALL_DETECTED_14D', contact: 'C-R6611', ago: '7 min ago', action: 'queue approval: move_opportunity 5→8' },
  { rule: 'TAG_INTENT_HIGH_PRICE',         contact: 'C-J1083', ago: '9 min ago', action: 'add_tag intent:high' },
  { rule: 'CALENDAR_REMINDER_T-24H',       contact: 'C-M3382', ago: '12 min ago', action: 'send_sms reminder.v3' },
  { rule: 'LP_DISP_CANVASSED',             contact: 'C-S9942', ago: '14 min ago', action: 'add_to_workflow E.4' },
  { rule: 'OPP_AGED_NEGOTIATING_7D',       contact: 'C-J7755', ago: '18 min ago', action: 'notify_rep tanya@reece' },
  { rule: 'FORM_HRR_SUBMITTED',            contact: 'C-K0102', ago: '22 min ago', action: 'add_to_workflow S3.1' },
  { rule: 'TAG_DNC_HARD',                  contact: 'C-V8819', ago: '24 min ago', action: 'move_opportunity → Hard DNC' },
  { rule: 'LP_DISP_FDNS_DEMO_NOSHOW',      contact: 'C-T4471', ago: '29 min ago', action: 'add_to_workflow S5.2' },
  { rule: 'OPP_CLOSED_WON',                contact: 'C-L8821', ago: '34 min ago', action: 'add_to_workflow B.1' },
  { rule: 'CALENDAR_REBOOK_REQUESTED',     contact: 'C-N9921', ago: '41 min ago', action: 'send_email rebook.v2' },
  { rule: 'BEHAVIORAL_REENGAGED',          contact: 'C-D2204', ago: '46 min ago', action: 'remove_tag stage:cold' },
  { rule: 'OPP_AGED_COMMITTED_5D',         contact: 'C-J1083', ago: '52 min ago', action: 'queue approval: send_message vsl.committed' },
  { rule: 'TAG_HIGH_INTENT_DIGITAL',       contact: 'C-X4729', ago: '58 min ago', action: 'add_tag src:digital' },
  { rule: 'LP_DISP_CHATBOT_QUALIFIED',     contact: 'C-M3382', ago: '1 hr ago',   action: 'add_to_workflow S2.1' },
];

// ============ APPROVALS ============
const APPROVALS_PENDING = [
  {
    id: 'AP-118',
    type: 'move_opportunity',
    title: 'Move opportunity from Stage 5 → Stage 8 (Reactivation)',
    contact: CONTACTS[3], // Robert Chen
    rule: 'BEHAVIORAL_STALL_DETECTED_14D',
    activity: 'Last touch 14d ago — opened pricing PDF 3×, no reply to last 2 SMS.',
    confidence: 0.71,
    age: '41 min ago',
  },
  {
    id: 'AP-117',
    type: 'send_message',
    title: 'Send VSL re-engage SMS to Maria Gonzalez',
    contact: CONTACTS[0],
    rule: 'LP_DISP_FDNS_DEMO_COMPLETE',
    activity: 'Completed estimator 6d ago. Demo booked but no-show twice.',
    confidence: 0.64,
    age: '28 min ago',
  },
  {
    id: 'AP-116',
    type: 'add_to_workflow',
    title: 'Add John Patel to W8.0 (Hot Pricing Drop)',
    contact: CONTACTS[1],
    rule: 'TAG_INTENT_HIGH_PRICE',
    activity: 'Compared 3 pricing options on the calculator this morning.',
    confidence: 0.82,
    age: '12 min ago',
  },
];

const APPROVALS_HISTORY = [
  { decision: 'approve', who: 'jess@reece', when: '32 min ago', what: 'move_opportunity → Reactivation · C-J7755' },
  { decision: 'reject',  who: 'jess@reece', when: '47 min ago', what: 'send_message vsl.committed · C-J1083 (already replied today)' },
  { decision: 'approve', who: 'mike@reece', when: '1h ago',     what: 'add_to_workflow S5.2 · C-T4471' },
  { decision: 'approve', who: 'jess@reece', when: '2h ago',     what: 'remove_tag stage:cold · C-D2204' },
  { decision: 'reject',  who: 'mike@reece', when: '2h ago',     what: 'auto_disqualify · C-V8819 (manual DNC pending)' },
  { decision: 'approve', who: 'jess@reece', when: '3h ago',     what: 'notify_rep tanya@reece · C-J7755' },
  { decision: 'approve', who: 'mike@reece', when: '4h ago',     what: 'add_to_workflow C.1 · C-L8821' },
  { decision: 'reject',  who: 'jess@reece', when: '5h ago',     what: 'send_sms reminder.v3 · C-M3382 (off-hours)' },
  { decision: 'approve', who: 'jess@reece', when: '6h ago',     what: 'move_opportunity → Comparing-BOFU · C-J1083' },
  { decision: 'approve', who: 'mike@reece', when: '7h ago',     what: 'add_to_workflow W8.0 · C-X4729' },
];

// ============ LEADS ============
const LEAD_TILES = { week: 142, booked: 38, held: 31, close: 24 };
const LEAD_SOURCES = [
  { source: 'Estimate Calculator', share: 32, close: 31, ttd: 1.4, rev: 312000, color: '#0C2340' },
  { source: 'HRR',                 share: 24, close: 27, ttd: 2.1, rev: 248000, color: '#1B3349' },
  { source: 'Canvassing',          share: 18, close: 18, ttd: 5.6, rev: 174000, color: '#6588A0' },
  { source: 'High-Intent Digital', share: 14, close: 22, ttd: 1.9, rev: 198000, color: '#ED1E24' },
  { source: 'Chatbot',             share:  8, close: 14, ttd: 3.2, rev:  82000, color: '#94a3b8' },
  { source: 'Referral',            share:  4, close: 38, ttd: 1.1, rev: 124000, color: '#FAF0C9' },
];

const ABANDONED_LEADS = [
  { name: 'Maria Gonzalez',  source: 'Estimate Calculator', days: 9,  stage: 'Curious-MOFU',    last: 'Opened pricing PDF' },
  { name: 'John Patel',      source: 'HRR',                 days: 14, stage: 'Comparing-BOFU',  last: 'No reply to SMS' },
  { name: 'Robert Chen',     source: 'High-Intent Digital', days: 21, stage: 'Negotiating',     last: 'Missed callback' },
  { name: 'Sandra Williams', source: 'Canvassing',          days: 11, stage: 'Curious-TOFU',    last: 'Opened email' },
  { name: 'Jennifer Davis',  source: 'Referral',            days: 6,  stage: 'Solution Pitch',  last: 'Asked to re-quote' },
  { name: 'Marcus Johnson',  source: 'Chatbot',             days: 18, stage: 'Re-engagement',   last: 'No activity' },
  { name: 'David Thompson',  source: 'HRR',                 days: 33, stage: 'Long-Term Hold',  last: 'Said “maybe spring”' },
  { name: 'Lisa Rodriguez',  source: 'Estimate Calculator', days: 4,  stage: 'Committed',       last: 'Awaiting signature' },
];

// ============ APPOINTMENTS ============
const APPT_GROUPS = [
  { type: 'Window Estimate', items: [
    { time: '09:00', name: 'Maria Gonzalez', rep: 'Carlos M.', addr: '4421 NW 112th Way, Coral Springs', status: 'confirmed' },
    { time: '11:30', name: 'John Patel',     rep: 'Tanya R.',  addr: '8302 SW 21st Ct, Plantation',      status: 'confirmed' },
  ]},
  { type: 'Measurement Verification', items: [
    { time: '10:15', name: 'Lisa Rodriguez', rep: 'Jeff B.',  addr: '12077 Sunrise Blvd, Sunrise',       status: 'in-progress' },
  ]},
  { type: 'Home Protection Assessment', items: [
    { time: '13:00', name: 'Robert Chen',    rep: 'Carlos M.', addr: '2401 Weston Rd, Weston',           status: 'confirmed' },
    { time: '15:30', name: 'Sandra Williams',rep: 'Priscilla L.', addr: '617 Las Olas, Ft. Lauderdale', status: 'confirmed' },
  ]},
  { type: 'Confirmation Call', items: [
    { time: '14:00', name: 'Jennifer Davis', rep: 'Tanya R.',  addr: '(phone)',                          status: 'pending' },
  ]},
  { type: 'Review Session', items: [
    { time: '16:45', name: 'Marcus Johnson', rep: 'Jeff B.',   addr: '(zoom)',                           status: 'confirmed' },
    { time: '17:30', name: 'David Thompson', rep: 'Priscilla L.', addr: '(zoom)',                       status: 'tentative' },
  ]},
];

const CANCELLATIONS = {
  engaged: [
    { name: 'Maria Gonzalez', when: 'Yesterday 2pm slot',   reason: 'Conflict with kids — wants to reschedule Thu' },
    { name: 'Robert Chen',    when: 'Today 9am slot',       reason: 'Pushed by weather; rebook for next week' },
    { name: 'Jennifer Davis', when: 'Mon 11am slot',        reason: 'Asking for evening slot — has rep approval' },
    { name: 'John Patel',     when: 'Mon 4pm slot',         reason: 'Still wants to talk pricing — call instead' },
    { name: 'Marcus Johnson', when: 'Tue 1pm slot',         reason: 'Wants spouse present — rescheduling Sat' },
  ],
  cold: [
    { name: 'Sandra Williams', when: '2 weeks ago',          reason: 'Stopped responding after second confirm' },
    { name: 'David Thompson',  when: '3 weeks ago',          reason: 'Tagged long-term-hold; check back in Q3' },
    { name: 'Lisa Rodriguez',  when: '1 week ago',           reason: 'Went with competitor (price)' },
    { name: 'Carlos Reyes',    when: '10 days ago',          reason: 'Number disconnected' },
    { name: 'Erin Lopez',      when: '4 weeks ago',          reason: 'Asked for time, never followed up' },
  ],
};

// ============ ISSUES ============
const ISSUES = {
  open: [
    { sev: 'high', title: 'W0.4 Canvassing Bridge UNPUBLISHED', opened: 'Today 09:20', owner: 'mike@reece' },
    { sev: 'high', title: 'workflow_executions table not populating',      opened: 'Today 08:14', owner: 'jess@reece' },
    { sev: 'med',  title: 'W11.1 still in Draft',                          opened: 'Yesterday',   owner: 'mike@reece' },
    { sev: 'med',  title: 'Heartbeat exceeding 10 min threshold',          opened: '11 min ago',  owner: 'unassigned' },
    { sev: 'low',  title: 'Twilio 21610 STOP from #C-R6611',               opened: '32 min ago',  owner: 'tanya@reece' },
    { sev: 'low',  title: 'Calendar drift: GHL vs Supabase 4 contacts',    opened: '2d ago',      owner: 'jess@reece' },
  ],
  contam: [
    { code: 'S1.1', viol: 'Tags engaged contacts as cold on Day 30',         fix: 'Add namespace guard stage:engaged ⨯ stage:cold' },
    { code: 'L.4',  viol: 'Re-enters contacts already in Hard DNC',          fix: 'Add pre-enter check tag != stage:hard_dnc' },
    { code: 'E.4',  viol: 'Promotes contacts who booked but no-showed',      fix: 'Block trigger when last appt status = no-show' },
  ],
  namespace: DIAG.namespace.rows,
  drift: [
    { name: 'David Thompson',  ghl: 'closed-lost', lp: 'still active in S1.1' },
    { name: 'Sandra Williams', ghl: 'archived',    lp: 'active in E.4' },
    { name: 'Carlos Reyes',    ghl: 'deleted',     lp: 'active in S5.2' },
    { name: 'Erin Lopez',      ghl: 'closed-lost', lp: 'active in L.4' },
  ],
  stuck: [
    { name: 'Maria Gonzalez',  stage: 'Curious-MOFU',   days: 22, last: 'Opened pricing PDF' },
    { name: 'John Patel',      stage: 'Comparing-BOFU', days: 18, last: 'No reply 5d' },
    { name: 'Robert Chen',     stage: 'Negotiating',    days: 14, last: 'Missed callback' },
    { name: 'Marcus Johnson',  stage: 'Re-engagement',  days: 26, last: 'No activity' },
    { name: 'Jennifer Davis',  stage: 'Solution Pitch', days: 11, last: 'Wants re-quote' },
    { name: 'David Thompson',  stage: 'Long-Term Hold', days: 92, last: '“maybe spring”' },
    { name: 'C-K0102',         stage: 'Curious-TOFU',   days: 17, last: 'Bounced email' },
    { name: 'C-V8819',         stage: 'Hard Disqualified', days: 31, last: 'DNC honor' },
    { name: 'C-N9921',         stage: 'Committed',      days: 9,  last: 'Awaiting signature' },
  ],
};

// ============ OPS LOG ============
const SESSION_LOGS = Array.from({length: 15}).map((_, i) => ({
  id: `sess-${1240 - i}`,
  who: ['jess@reece','mike@reece','tanya@reece','carlos@reece'][i % 4],
  start: `${(8 + (i % 9)).toString().padStart(2,'0')}:${(i*7 % 60).toString().padStart(2,'0')}`,
  dur: `${4 + (i*3 % 22)}m`,
  actions: 2 + (i * 5 % 17),
  outcome: i % 5 === 0 ? 'closed early' : (i % 3 === 0 ? 'rule edited' : 'normal'),
  detail: i % 3 === 0 ? 'Edited rule BEHAVIORAL_STALL_DETECTED_14D confidence 0.65→0.71' : 'Reviewed approval queue, cleared 4 items',
}));

const DECISION_LOGS = Array.from({length: 15}).map((_, i) => ({
  id: `dec-${20104 - i}`,
  rule: ['BEHAVIORAL_STALL_DETECTED_14D','TAG_INTENT_HIGH_PRICE','OPP_AGED_NEGOTIATING_7D','CALENDAR_REMINDER_T-24H','LP_DISP_FDNS_DEMO_COMPLETE'][i%5],
  contact: ['C-X4729','C-J1083','C-S9942','C-R6611','C-J7755','C-M3382'][i%6],
  confidence: (0.55 + (i * 0.031 % 0.4)).toFixed(2),
  decision: i % 4 === 0 ? 'queued for approval' : (i % 4 === 1 ? 'auto-executed' : (i % 4 === 2 ? 'no-op' : 'auto-rejected')),
  detail: 'Inputs: 18 features. Top features: last_touch_age (0.34), pdf_open_count (0.22), reply_rate (-0.18)',
  when: `${(11 - Math.floor(i/4)).toString().padStart(2,'0')}:${(58 - i*3 % 58).toString().padStart(2,'0')}`,
}));

const SYSTEM_EVENTS = Array.from({length: 15}).map((_, i) => ({
  id: `evt-${88210 - i}`,
  pri: i === 0 ? 'high' : (i % 4 === 0 ? 'med' : 'low'),
  src: ['lp-mcp','hl-mcp','decision-engine','supabase','agent-layer'][i%5],
  msg: [
    'webhook signature mismatch → dropped',
    'rule fired LP_DISP_FDNS_DEMO_COMPLETE',
    'edge function cold start 1.2s',
    'twilio 21610 STOP for C-R6611',
    'opportunity stage transition 5→6 for C-J1083',
  ][i%5],
  when: `${(11 - Math.floor(i/4)).toString().padStart(2,'0')}:${(58 - i*3 % 58).toString().padStart(2,'0')}`,
}));

Object.assign(window, {
  CONTACTS, REPS,
  SERVICE_HEALTH, HEADLINE_STATS, ACTIVITY_FEED, ALERTS,
  PIPELINES,
  WORKFLOWS, WORKFLOW_STATS, WORKFLOW_FAMILIES,
  DIAG,
  AGENT_TILES, AGENT_SERIES, RULE_FIRINGS,
  APPROVALS_PENDING, APPROVALS_HISTORY,
  LEAD_TILES, LEAD_SOURCES, ABANDONED_LEADS,
  APPT_GROUPS, CANCELLATIONS,
  ISSUES,
  SESSION_LOGS, DECISION_LOGS, SYSTEM_EVENTS,
});
