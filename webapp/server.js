const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const yaml = require('js-yaml');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const WORKSPACES_DIR = path.join(ROOT, 'workspaces');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const EXCLUDED = new Set(['node_modules', '.git', '.DS_Store', '.meta.json']);

// role -> docs (relative to workspace root) used to ground that agent's system prompt
const ROLE_CONFIG = {
  design: {
    agentFile: 'design',
    label: 'Design',
    contextDocs: ['product-development/product/CLAUDE.md', 'product-development/design/CLAUDE.md'],
  },
  engineering: {
    agentFile: 'engineering',
    label: 'Engineering',
    contextDocs: ['product-development/product/CLAUDE.md', 'product-development/engineering/CLAUDE.md'],
  },
  analytics: {
    agentFile: 'analytics',
    label: 'Data & Analytics',
    contextDocs: ['product-development/product/CLAUDE.md', 'product-development/analytics/CLAUDE.md'],
  },
  'product-research': {
    agentFile: 'product-research',
    label: 'Research',
    contextDocs: [
      'product-development/product/CLAUDE.md',
      'product-development/product/customers/CLAUDE.md',
      'product-development/product/strategy/business-context/jtbd-and-users.md',
    ],
  },
  'product-strategy': {
    agentFile: 'product-strategy',
    label: 'Strategy',
    contextDocs: [
      'product-development/product/CLAUDE.md',
      'product-development/product/strategy/CLAUDE.md',
      'product-development/product/strategy/vision/vision.md',
      'product-development/product/strategy/business-context/business-info.md',
      'product-development/product/strategy/roadmaps/now-next-later.md',
    ],
  },
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'company';
}

function workspaceRoot(slug) {
  const resolved = path.resolve(WORKSPACES_DIR, slug);
  if (!resolved.startsWith(WORKSPACES_DIR) || !fs.existsSync(resolved)) {
    throw new Error('Unknown workspace');
  }
  return resolved;
}

function safeResolve(root, relPath) {
  const resolved = path.resolve(root, relPath || '.');
  if (!resolved.startsWith(root)) throw new Error('Invalid path');
  return resolved;
}

function buildTree(dir, root) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !EXCLUDED.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries.map((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      return { type: 'dir', name: entry.name, path: relPath, children: buildTree(fullPath, root) };
    }
    return { type: 'file', name: entry.name, path: relPath };
  });
}

function copyTemplateDir(src, dest, replacements) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTemplateDir(srcPath, destPath, replacements);
    } else {
      let content = fs.readFileSync(srcPath, 'utf8');
      for (const [key, value] of Object.entries(replacements)) {
        content = content.split(`{{${key}}}`).join(value);
      }
      fs.writeFileSync(destPath, content);
    }
  }
}

// ---------- Workspaces ----------

app.get('/api/workspaces', (req, res) => {
  const slugs = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const workspaces = slugs.map((slug) => {
    const metaPath = path.join(WORKSPACES_DIR, slug, '.meta.json');
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : { slug };
    return meta;
  });
  res.json(workspaces);
});

app.post('/api/workspaces', (req, res) => {
  try {
    const { companyName, oneLiner, founderName } = req.body;
    if (!companyName || !companyName.trim()) return res.status(400).json({ error: 'Company name required' });

    let slug = slugify(companyName);
    let dest = path.join(WORKSPACES_DIR, slug);
    let suffix = 2;
    while (fs.existsSync(dest)) {
      slug = `${slugify(companyName)}-${suffix}`;
      dest = path.join(WORKSPACES_DIR, slug);
      suffix += 1;
    }

    copyTemplateDir(TEMPLATES_DIR, dest, {
      COMPANY_NAME: companyName.trim(),
      ONE_LINER: (oneLiner || '').trim() || 'Fill in your one-liner.',
      FOUNDER_NAME: (founderName || '').trim() || 'You',
    });

    const meta = {
      slug,
      companyName: companyName.trim(),
      oneLiner: (oneLiner || '').trim(),
      founderName: (founderName || '').trim() || 'You',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dest, '.meta.json'), JSON.stringify(meta, null, 2));

    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Docs ----------

app.get('/api/ws/:slug/tree', (req, res) => {
  try {
    const root = workspaceRoot(req.params.slug);
    res.json(buildTree(root, root));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/ws/:slug/file', (req, res) => {
  try {
    const root = workspaceRoot(req.params.slug);
    const filePath = safeResolve(root, req.query.path);
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ path: req.query.path, content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const FEATURE_INDEX_REL = 'product-development/feature-index.yaml';
const STATUSES = ['idea', 'scoped', 'building', 'shipped'];

function readFeatureIndex(root) {
  const raw = fs.readFileSync(path.join(root, FEATURE_INDEX_REL), 'utf8');
  const lines = raw.split('\n');
  let splitAt = 0;
  while (splitAt < lines.length && (lines[splitAt].trim() === '' || lines[splitAt].trim().startsWith('#'))) {
    splitAt += 1;
  }
  const header = lines.slice(0, splitAt).join('\n');
  const body = yaml.load(lines.slice(splitAt).join('\n')) || {};
  return { header, body };
}

function writeFeatureIndex(root, header, body) {
  const dumped = Object.keys(body).length ? yaml.dump(body, { lineWidth: -1 }) : '';
  const content = header.trim() ? `${header}\n\n${dumped}` : dumped;
  fs.writeFileSync(path.join(root, FEATURE_INDEX_REL), content);
}

app.get('/api/ws/:slug/features', (req, res) => {
  try {
    const root = workspaceRoot(req.params.slug);
    const { body } = readFeatureIndex(root);
    res.json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function writeFeatureStubs(root, key, name, { prdPath, planPath, metricsPath }) {
  const stub = (title) => `# ${title}: ${name}\n\n**Status:** idea — not yet scoped\n`;
  for (const [rel, title] of [
    [`product-development/${prdPath}`, 'PRD'],
    [`product-development/${planPath}`, 'Plan'],
    [`product-development/${metricsPath}`, 'Metrics'],
  ]) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, stub(title));
  }
}

// Creates a feature at an exact key; throws if that key is already taken.
function createFeatureExact(root, name, oneLiner) {
  const key = slugify(name);
  const { header, body } = readFeatureIndex(root);
  if (body[key]) throw new Error('A feature with that name already exists');

  const paths = {
    prdPath: `product/PRDs/${key}/prd.md`,
    planPath: `engineering/plans/${key}/plan.md`,
    metricsPath: `analytics/metrics/${key}/metrics.md`,
  };
  body[key] = {
    status: 'idea',
    'one-liner': (oneLiner || '').trim() || 'Fill in what this feature does.',
    prd: paths.prdPath,
    'eng-plan': paths.planPath,
    metrics: paths.metricsPath,
  };
  writeFeatureIndex(root, header, body);
  writeFeatureStubs(root, key, name, paths);
  return { key, ...body[key] };
}

// Creates a feature, auto-suffixing the key if it collides — for automated/AI-driven creation.
function createFeatureAutoKey(root, name, oneLiner) {
  const { header, body } = readFeatureIndex(root);
  let key = slugify(name);
  let suffix = 2;
  while (body[key]) {
    key = `${slugify(name)}-${suffix}`;
    suffix += 1;
  }
  const paths = {
    prdPath: `product/PRDs/${key}/prd.md`,
    planPath: `engineering/plans/${key}/plan.md`,
    metricsPath: `analytics/metrics/${key}/metrics.md`,
  };
  body[key] = {
    status: 'idea',
    'one-liner': (oneLiner || '').trim() || 'Fill in what this feature does.',
    prd: paths.prdPath,
    'eng-plan': paths.planPath,
    metrics: paths.metricsPath,
  };
  writeFeatureIndex(root, header, body);
  writeFeatureStubs(root, key, name, paths);
  return { key, ...body[key] };
}

app.post('/api/ws/:slug/features', (req, res) => {
  try {
    const root = workspaceRoot(req.params.slug);
    const { name, oneLiner } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Feature name required' });
    const feature = createFeatureExact(root, name, oneLiner);
    res.json(feature);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/ws/:slug/features/:key/status', (req, res) => {
  try {
    const root = workspaceRoot(req.params.slug);
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { header, body } = readFeatureIndex(root);
    if (!body[req.params.key]) return res.status(404).json({ error: 'Unknown feature' });
    body[req.params.key].status = status;
    writeFeatureIndex(root, header, body);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ws/:slug/team', (req, res) => {
  try {
    const root = workspaceRoot(req.params.slug);
    const raw = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    const tableMatch = raw.match(/## Team\s*\n\n([\s\S]*?)\n\n/);
    const rows = [];
    if (tableMatch) {
      const lines = tableMatch[1].trim().split('\n').slice(2);
      for (const line of lines) {
        const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 3) rows.push({ function: cells[0], person: cells[1], status: cells[2] });
      }
    }

    const agentsDir = path.join(root, '.claude/agents');
    const availableAgents = fs.existsSync(agentsDir)
      ? fs.readdirSync(agentsDir).map((f) => f.replace(/\.md$/, ''))
      : [];
    const productSubAgents = availableAgents
      .filter((role) => role.startsWith('product-'))
      .map((role) => ({ role, label: (ROLE_CONFIG[role] && ROLE_CONFIG[role].label) || role }));

    res.json({ rows, productSubAgents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Chat ----------

function loadAgent(root, role) {
  const cfg = ROLE_CONFIG[role];
  const agentPath = path.join(root, '.claude/agents', `${cfg.agentFile}.md`);
  const raw = fs.readFileSync(agentPath, 'utf8');
  const parts = raw.split('---').filter(Boolean);
  const body = parts.slice(1).join('---').trim();
  return body;
}

function loadContextDocs(root, role) {
  const cfg = ROLE_CONFIG[role];
  return cfg.contextDocs
    .map((relPath) => {
      const full = path.join(root, relPath);
      if (!fs.existsSync(full)) return null;
      return `## ${relPath}\n\n${fs.readFileSync(full, 'utf8')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildSystemPrompt(root, role) {
  const agentBody = loadAgent(root, role);
  return `${agentBody}\n\n---\n\nUse the following docs as ground truth context. If they're sparse or say "fill in", say so honestly rather than inventing specifics.\n\n${loadContextDocs(root, role)}`;
}

function getProvider() {
  if (process.env.LLM_PROVIDER) return process.env.LLM_PROVIDER;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.CUSTOM_API_KEY) return 'custom';
  return null;
}

function requireApiKey(res) {
  if (!getProvider()) {
    res.status(400).json({
      error: 'No API key set. Add ANTHROPIC_API_KEY, GEMINI_API_KEY, or CUSTOM_API_KEY to webapp/.env (copy from .env.example) and restart the server.',
    });
    return false;
  }
  return true;
}

// messages: [{ role: 'user' | 'assistant', content: string }], oldest first.
// Returns the plain text reply.
async function callLLM({ system, messages, maxTokens }) {
  const provider = getProvider();

  if (provider === 'custom') {
    const baseUrl = (process.env.CUSTOM_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CUSTOM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.CUSTOM_MODEL || 'claude-sonnet-5',
        max_tokens: maxTokens || 1024,
        messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Custom provider error (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      systemInstruction: system,
    });
    const last = messages[messages.length - 1];
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last.content);
    return result.response.text();
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens || 1024,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

function historyPath(slug, role) {
  const dir = path.join(DATA_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `chat-${role}.json`);
}

function loadHistory(slug, role) {
  const p = historyPath(slug, role);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
}

function saveHistory(slug, role, history) {
  fs.writeFileSync(historyPath(slug, role), JSON.stringify(history, null, 2));
}

app.get('/api/ws/:slug/chat/:role', (req, res) => {
  const { slug, role } = req.params;
  if (!ROLE_CONFIG[role]) return res.status(404).json({ error: 'Unknown role' });
  res.json({ history: loadHistory(slug, role) });
});

app.post('/api/ws/:slug/chat/:role/reset', (req, res) => {
  const { slug, role } = req.params;
  if (!ROLE_CONFIG[role]) return res.status(404).json({ error: 'Unknown role' });
  saveHistory(slug, role, []);
  res.json({ ok: true });
});

app.post('/api/ws/:slug/chat/:role', async (req, res) => {
  const { slug, role } = req.params;
  const { message } = req.body;
  if (!ROLE_CONFIG[role]) return res.status(404).json({ error: 'Unknown role' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
  if (!requireApiKey(res)) return;

  try {
    const root = workspaceRoot(slug);
    const system = buildSystemPrompt(root, role);

    const history = loadHistory(slug, role);
    history.push({ role: 'user', content: message });

    const replyText = await callLLM({ system, messages: history, maxTokens: 1024 });

    history.push({ role: 'assistant', content: replyText });
    saveHistory(slug, role, history);

    res.json({ reply: replyText, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Propose to team ----------

function proposalsPath(slug) {
  const dir = path.join(DATA_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'proposals.json');
}

function loadProposals(slug) {
  const p = proposalsPath(slug);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
}

function saveProposals(slug, proposals) {
  fs.writeFileSync(proposalsPath(slug), JSON.stringify(proposals, null, 2));
}

function availableRoles(root) {
  const agentsDir = path.join(root, '.claude/agents');
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir)
    .map((f) => f.replace(/\.md$/, ''))
    .filter((role) => ROLE_CONFIG[role]);
}

app.get('/api/ws/:slug/proposals', (req, res) => {
  try {
    res.json(loadProposals(req.params.slug));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ws/:slug/propose', async (req, res) => {
  const { slug } = req.params;
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
  if (!requireApiKey(res)) return;

  try {
    const root = workspaceRoot(slug);
    const roles = availableRoles(root);

    const responses = await Promise.all(
      roles.map(async (role) => {
        const system = buildSystemPrompt(root, role);
        const text = await callLLM({
          system,
          maxTokens: 700,
          messages: [{ role: 'user', content: `The founder just proposed this to the whole team:\n\n"${message}"\n\nGive your take from your function's perspective — concise, opinionated, and specific.` }],
        });
        return { role, label: ROLE_CONFIG[role].label, text };
      })
    );

    const entry = { timestamp: new Date().toISOString(), message, responses };
    const proposals = loadProposals(slug);
    proposals.unshift(entry);
    saveProposals(slug, proposals);

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ws/:slug/proposals/:timestamp/feature', async (req, res) => {
  const { slug, timestamp } = req.params;
  if (!requireApiKey(res)) return;

  try {
    const root = workspaceRoot(slug);
    const proposals = loadProposals(slug);
    const entry = proposals.find((p) => p.timestamp === decodeURIComponent(timestamp));
    if (!entry) return res.status(404).json({ error: 'Unknown proposal' });
    if (entry.featureKey) return res.json({ key: entry.featureKey, alreadyExists: true });

    const digest = `Proposal: ${entry.message}\n\nTeam responses:\n\n` +
      entry.responses.map((r) => `${r.label}: ${r.text}`).join('\n\n');

    const text = (await callLLM({
      system: 'You turn a product proposal discussion into a single backlog feature entry. Respond with ONLY a JSON object, no markdown, no code fences: {"name": "kebab-case-2-to-4-words", "oneLiner": "one sentence describing the feature"}.',
      maxTokens: 200,
      messages: [{ role: 'user', content: digest }],
    })).trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed || !parsed.name) throw new Error('Could not draft a feature from this discussion');

    const feature = createFeatureAutoKey(root, parsed.name, parsed.oneLiner);
    entry.featureKey = feature.key;
    saveProposals(slug, proposals);

    res.json(feature);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4174;
app.listen(PORT, () => {
  console.log(`Founder's AI Team running at http://localhost:${PORT}`);
});
