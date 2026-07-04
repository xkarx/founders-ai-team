const ROLE_MAP = {
  'Design': 'design',
  'Engineering': 'engineering',
  'Data & Analytics': 'analytics',
};

let currentWorkspace = null; // { slug, companyName, oneLiner, founderName }

// ---------- Setup / workspace switching ----------

async function fetchWorkspaces() {
  const res = await fetch('/api/workspaces');
  return res.json();
}

async function showSetupScreen() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  const workspaces = await fetchWorkspaces();
  const list = document.getElementById('existing-list');
  const existingSection = document.getElementById('setup-existing');
  list.innerHTML = '';
  if (workspaces.length === 0) {
    existingSection.classList.add('hidden');
  } else {
    existingSection.classList.remove('hidden');
    workspaces.forEach((ws) => {
      const item = document.createElement('div');
      item.className = 'existing-item';
      item.innerHTML = `
        <div>
          <div class="name">${ws.companyName}</div>
          <div class="oneliner">${ws.oneLiner || ''}</div>
        </div>
        <span>Open →</span>
      `;
      item.addEventListener('click', () => openWorkspace(ws));
      list.appendChild(item);
    });
  }
}

function openWorkspace(ws) {
  currentWorkspace = ws;
  localStorage.setItem('founderos-last-workspace', ws.slug);
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('brand-name').textContent = ws.companyName;
  loadTree();
  loadFeatures();
  loadTeam();
}

document.getElementById('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const companyName = document.getElementById('setup-company').value.trim();
  const oneLiner = document.getElementById('setup-oneliner').value.trim();
  const founderName = document.getElementById('setup-founder').value.trim();
  if (!companyName) return;

  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, oneLiner, founderName }),
  });
  const ws = await res.json();
  if (ws.error) {
    alert(ws.error);
    return;
  }
  openWorkspace(ws);
});

document.getElementById('switch-workspace').addEventListener('click', () => {
  document.getElementById('chat-panel').classList.add('hidden');
  showSetupScreen();
});

async function init() {
  const workspaces = await fetchWorkspaces();
  const lastSlug = localStorage.getItem('founderos-last-workspace');
  const last = workspaces.find((w) => w.slug === lastSlug);
  if (last) {
    openWorkspace(last);
  } else {
    showSetupScreen();
  }
}

// ---------- Nav ----------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
  });
});

// ---------- Docs tree ----------
async function loadTree() {
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/tree`);
  const tree = await res.json();
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  container.appendChild(renderTree(tree, 0));
}

function renderTree(nodes, depth) {
  const ul = document.createElement('div');
  const indent = depth * 16 + 'px';
  nodes.forEach((node) => {
    if (node.type === 'dir') {
      const wrap = document.createElement('div');
      wrap.className = 'tree-dir';
      const label = document.createElement('div');
      label.className = 'tree-label';
      label.style.paddingLeft = indent;
      const children = renderTree(node.children, depth + 1);
      children.className = 'tree-children';
      children.style.display = 'block';
      label.textContent = '▾ 📁 ' + node.name;
      label.addEventListener('click', () => {
        const collapsed = children.style.display === 'none';
        children.style.display = collapsed ? 'block' : 'none';
        label.textContent = (collapsed ? '▾ 📁 ' : '▸ 📁 ') + node.name;
      });
      wrap.appendChild(label);
      wrap.appendChild(children);
      ul.appendChild(wrap);
    } else {
      const el = document.createElement('div');
      el.className = 'tree-file';
      el.style.paddingLeft = indent;
      el.textContent = '📄 ' + node.name;
      el.addEventListener('click', async () => {
        document.querySelectorAll('.tree-file').forEach((f) => f.classList.remove('selected'));
        el.classList.add('selected');
        await openFile(node.path);
      });
      ul.appendChild(el);
    }
  });
  return ul;
}

async function openFile(filePath) {
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/file?path=` + encodeURIComponent(filePath));
  const data = await res.json();
  const content = document.getElementById('file-content');
  if (data.error) {
    content.innerHTML = `<p class="empty-hint">Could not open file: ${data.error}</p>`;
    return;
  }
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    content.innerHTML = `<pre>${escapeHtml(data.content)}</pre>`;
  } else {
    content.innerHTML = marked.parse(data.content);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---------- Features / Kanban board ----------
const STATUSES = [
  { key: 'idea', label: 'Idea' },
  { key: 'scoped', label: 'Scoped' },
  { key: 'building', label: 'Building' },
  { key: 'shipped', label: 'Shipped' },
];

let allFeatures = {};

async function loadFeatures() {
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/features`);
  allFeatures = await res.json();
  renderBoard(allFeatures);
  document.getElementById('feature-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = Object.fromEntries(
      Object.entries(allFeatures).filter(([name, f]) =>
        name.toLowerCase().includes(q) || (f['one-liner'] || '').toLowerCase().includes(q)
      )
    );
    renderBoard(filtered);
  };
}

function renderBoard(features) {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  const entries = Object.entries(features || {});

  STATUSES.forEach(({ key, label }) => {
    const column = document.createElement('div');
    column.className = 'kanban-column';
    column.dataset.status = key;

    const title = document.createElement('div');
    title.className = 'kanban-column-title';
    const count = entries.filter(([, f]) => (f.status || 'idea') === key).length;
    title.textContent = `${label} (${count})`;
    column.appendChild(title);

    entries.filter(([, f]) => (f.status || 'idea') === key).forEach(([name, f]) => {
      const card = document.createElement('div');
      card.className = 'feature-card';
      card.draggable = true;
      card.dataset.name = name;
      card.innerHTML = `<h3>${name}</h3><p>${f['one-liner'] || ''}</p>`;
      card.addEventListener('dragstart', () => card.classList.add('dragging'));
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      column.appendChild(card);
    });

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const dragging = document.querySelector('.feature-card.dragging');
      if (!dragging) return;
      const name = dragging.dataset.name;
      if (allFeatures[name]) allFeatures[name].status = key;
      renderBoard(allFeatures);
      await fetch(`/api/ws/${currentWorkspace.slug}/features/${name}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: key }),
      });
    });

    board.appendChild(column);
  });
}

document.getElementById('add-feature-btn').addEventListener('click', () => {
  document.getElementById('add-feature-form').classList.toggle('hidden');
});
document.getElementById('new-feature-cancel').addEventListener('click', () => {
  document.getElementById('add-feature-form').classList.add('hidden');
});
document.getElementById('new-feature-submit').addEventListener('click', async () => {
  const name = document.getElementById('new-feature-name').value.trim();
  const oneLiner = document.getElementById('new-feature-oneliner').value.trim();
  if (!name) return;
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, oneLiner }),
  });
  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }
  document.getElementById('new-feature-name').value = '';
  document.getElementById('new-feature-oneliner').value = '';
  document.getElementById('add-feature-form').classList.add('hidden');
  loadFeatures();
  loadTree();
});

// ---------- Team ----------
async function loadTeam() {
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/team`);
  const { rows, productSubAgents } = await res.json();
  const container = document.getElementById('team-cards');
  container.innerHTML = '';
  rows.forEach((row) => {
    const isAI = row.status.toLowerCase().includes('ai');
    const role = ROLE_MAP[row.function];
    const isProduct = /product/i.test(row.function);

    const card = document.createElement('div');
    card.className = 'team-card';
    const buttonHtml = isProduct
      ? `<button class="propose-btn">💬 Propose to team</button>`
      : `<button ${isAI && role ? '' : 'disabled'}>${isAI ? 'Chat' : 'No chat needed'}</button>`;
    card.innerHTML = `
      <span class="badge ${isAI ? 'ai' : 'real'}">${isAI ? 'AI Agent' : 'Real'}</span>
      <h3>${row.function}</h3>
      <div class="person">${row.person === 'TBD' ? 'Unfilled' : row.person}</div>
      ${buttonHtml}
    `;
    if (isProduct) {
      card.querySelector('button').addEventListener('click', openPropose);
    } else if (isAI && role) {
      card.querySelector('button').addEventListener('click', () => openChat(role, row.function));
    }

    if (isProduct && productSubAgents && productSubAgents.length > 0) {
      const subWrap = document.createElement('div');
      subWrap.className = 'sub-agents';
      subWrap.innerHTML = `<div class="sub-label">Lead agents</div>`;
      productSubAgents.forEach((sub) => {
        const btn = document.createElement('button');
        btn.className = 'sub-agent-btn';
        btn.textContent = `💬 ${sub.label}`;
        btn.addEventListener('click', () => openChat(sub.role, `Product: ${sub.label}`));
        subWrap.appendChild(btn);
      });
      card.appendChild(subWrap);
    }

    container.appendChild(card);
  });
}

// ---------- Chat ----------
let currentRole = null;

async function openChat(role, label) {
  currentRole = role;
  document.getElementById('propose-panel').classList.add('hidden');
  document.getElementById('chat-title').textContent = label;
  document.getElementById('chat-subtitle').textContent = 'AI teammate: ' + currentWorkspace.companyName;
  document.getElementById('chat-panel').classList.remove('hidden');
  document.getElementById('chat-error').classList.add('hidden');
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/chat/${role}`);
  const data = await res.json();
  renderMessages(data.history || []);
}

function renderMessages(history) {
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  history.forEach((m) => {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    div.textContent = m.content;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chat-close').addEventListener('click', () => {
  document.getElementById('chat-panel').classList.add('hidden');
});

document.getElementById('chat-reset').addEventListener('click', async () => {
  if (!currentRole) return;
  await fetch(`/api/ws/${currentWorkspace.slug}/chat/${currentRole}/reset`, { method: 'POST' });
  renderMessages([]);
});

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !currentRole) return;
  input.value = '';
  document.getElementById('chat-error').classList.add('hidden');

  const container = document.getElementById('chat-messages');
  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.textContent = message;
  container.appendChild(userDiv);
  container.scrollTop = container.scrollHeight;

  const res = await fetch(`/api/ws/${currentWorkspace.slug}/chat/${currentRole}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  if (data.error) {
    const errBox = document.getElementById('chat-error');
    errBox.textContent = data.error;
    errBox.classList.remove('hidden');
    return;
  }
  renderMessages(data.history);
});

// ---------- Propose to team ----------

async function openPropose() {
  document.getElementById('chat-panel').classList.add('hidden');
  document.getElementById('propose-panel').classList.remove('hidden');
  document.getElementById('propose-error').classList.add('hidden');
  const res = await fetch(`/api/ws/${currentWorkspace.slug}/proposals`);
  const proposals = await res.json();
  renderProposalLog(proposals);
}

function renderProposalEntry(entry) {
  const wrap = document.createElement('div');
  wrap.className = 'proposal-entry';
  const msg = document.createElement('div');
  msg.className = 'proposal-message';
  msg.textContent = entry.message;
  wrap.appendChild(msg);
  entry.responses.forEach((r) => {
    const respDiv = document.createElement('div');
    respDiv.className = 'proposal-response';
    respDiv.innerHTML = `<div class="role-label">${r.label}</div><div class="role-text"></div>`;
    respDiv.querySelector('.role-text').textContent = r.text;
    wrap.appendChild(respDiv);
  });

  const actionRow = document.createElement('div');
  actionRow.className = 'proposal-action';
  const btn = document.createElement('button');
  btn.className = 'turn-into-feature-btn';
  if (entry.featureKey) {
    btn.textContent = `✓ Added as ${entry.featureKey}`;
    btn.disabled = true;
  } else {
    btn.textContent = '→ Turn into feature';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Drafting feature…';
      const res = await fetch(
        `/api/ws/${currentWorkspace.slug}/proposals/${encodeURIComponent(entry.timestamp)}/feature`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.error) {
        btn.disabled = false;
        btn.textContent = '→ Turn into feature';
        const errBox = document.getElementById('propose-error');
        errBox.textContent = data.error;
        errBox.classList.remove('hidden');
        return;
      }
      entry.featureKey = data.key;
      btn.textContent = `✓ Added as ${data.key}`;
      loadFeatures();
      loadTree();
    });
  }
  actionRow.appendChild(btn);
  wrap.appendChild(actionRow);

  return wrap;
}

function renderProposalLog(proposals) {
  const log = document.getElementById('propose-log');
  log.innerHTML = '';
  if (!proposals || proposals.length === 0) {
    log.innerHTML = '<p class="empty-hint">Nothing proposed yet: ask the team something below.</p>';
    return;
  }
  proposals.forEach((entry) => log.appendChild(renderProposalEntry(entry)));
}

document.getElementById('propose-close').addEventListener('click', () => {
  document.getElementById('propose-panel').classList.add('hidden');
});

document.getElementById('propose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('propose-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  document.getElementById('propose-error').classList.add('hidden');

  const log = document.getElementById('propose-log');
  const loading = document.createElement('div');
  loading.className = 'proposal-loading';
  loading.textContent = 'Fanning out to the team…';
  log.prepend(loading);

  const res = await fetch(`/api/ws/${currentWorkspace.slug}/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  loading.remove();
  if (data.error) {
    const errBox = document.getElementById('propose-error');
    errBox.textContent = data.error;
    errBox.classList.remove('hidden');
    return;
  }
  log.prepend(renderProposalEntry(data));
});

// ---------- Init ----------
init();
