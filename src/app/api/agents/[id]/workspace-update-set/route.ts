export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const tenant = await db.tenant.findFirst({
    where: { user: { email: session.user.email } },
    include: { tokens: { where: { active: true }, take: 1 } },
  })
  if (!tenant) return NextResponse.json({ error: 'No tenant' }, { status: 404 })

  const agent = await db.agent.findFirst({ where: { id, tenantId: tenant.id } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const token = tenant.tokens[0]?.token || ''
  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.up.railway.app'
  const agentLabel = agent.widgetTitle || agent.name || 'ZeVox Agent'
  const tables = (agent.widgetWorkspaceTables || '')
    .split(',')
    .map((t: string) => t.trim())
    .filter(Boolean)

  const xml = buildAgentUpdateSet({ token, serverUrl, agentId: agent.id, agentLabel, tables })
  const slug = agentLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="zevox-${slug}.xml"`,
      'Cache-Control': 'no-store',
    },
  })
}

function buildAgentUpdateSet({
  token, serverUrl, agentId, agentLabel, tables,
}: {
  token: string
  serverUrl: string
  agentId: string
  agentLabel: string
  tables: string[]
}) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const hash = agentId.replace(/[^a-z0-9]/gi, '').substring(0, 16).toLowerCase()
  // JS array literal for the table filter — empty means all tables
  const tablesJs = tables.length
    ? JSON.stringify(tables)
    : '[]'

  return `<?xml version="1.0" encoding="UTF-8"?>
<unload unload_date="${now}">
  <sys_update_set action="INSERT_OR_UPDATE">
    <application display_value="Global">global</application>
    <description>ZeVox AI workspace panel for agent: ${escapeXml(agentLabel)}${tables.length ? '. Activates on: ' + tables.join(', ') : ' (all workspace tables)'}.</description>
    <name>ZeVox — ${escapeXml(agentLabel)}</name>
    <release_date>${now.substring(0, 10)}</release_date>
    <state>complete</state>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}uset001</sys_id>
  </sys_update_set>

  <sys_ui_script action="INSERT_OR_UPDATE">
    <active>true</active>
    <description>ZeVox AI sidebar panel — agent: ${escapeXml(agentLabel)}. Injects a slide-in voice+chat panel into ServiceNow Agent Workspace and Next Experience, passing the current record context automatically.</description>
    <global>true</global>
    <name>ZeVox_${escapeXml(agentId.replace(/[^a-zA-Z0-9]/g, '_'))}</name>
    <script><![CDATA[
(function () {
  'use strict';

  var TOKEN      = '${escapeXml(token)}';
  var SERVER_URL = '${escapeXml(serverUrl)}';
  var AGENT_ID   = '${escapeXml(agentId)}';
  var PANEL_URL  = SERVER_URL + '/panel';
  // Tables this panel activates on. Empty = all workspace tables.
  var TABLES     = ${tablesJs};

  // Only run in workspace contexts
  var path = window.location.pathname || '';
  var isWorkspace = path.indexOf('/now/workspace') !== -1 ||
                    path.indexOf('/now/unified-agent') !== -1 ||
                    path.indexOf('/now/nav/ui') !== -1;
  if (!isWorkspace) return;

  var panelOpen = false;
  var panelEl   = null;
  var currentTable   = '';
  var currentSysId   = '';
  var currentDisplay = '';

  function getRecordContext() {
    try {
      var m = window.location.href.match(/\/(?:form|record)\/([^/]+)\/([a-f0-9]{32})/i);
      if (m) return { table: m[1], sys_id: m[2] };
      var hm = window.location.hash.match(/\/(?:form|record)\/([^/]+)\/([a-f0-9]{32})/i);
      if (hm) return { table: hm[1], sys_id: hm[2] };
    } catch (e) {}
    return { table: '', sys_id: '' };
  }

  function tableAllowed(table) {
    if (!TABLES.length) return true;
    return TABLES.some(function (t) { return t.toLowerCase() === (table || '').toLowerCase(); });
  }

  function getDisplayLabel() {
    try {
      var h = document.querySelector('[data-field="number"] .sn-widget-textblock_value, .record-header .record-number');
      if (h) return h.textContent.trim();
      var title = document.querySelector('.workspace-header__title, .record-header__title');
      if (title) return title.textContent.trim().substring(0, 60);
    } catch (e) {}
    return '';
  }

  function buildIframeSrc(table, sys_id, display) {
    return PANEL_URL +
      '?token='   + encodeURIComponent(TOKEN) +
      '&agent='   + encodeURIComponent(AGENT_ID) +
      (table   ? '&table='   + encodeURIComponent(table)   : '') +
      (sys_id  ? '&sys_id='  + encodeURIComponent(sys_id)  : '') +
      (display ? '&display=' + encodeURIComponent(display) : '') +
      '&_t=' + Date.now();
  }

  function postRecordToPanel(table, sys_id, display) {
    if (!panelEl) return;
    var iframe = panelEl.querySelector('iframe');
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ type: 'zevox_record', table: table, sys_id: sys_id, display: display }, '*');
    } catch (e) {}
  }

  function createPanel() {
    var ctx = getRecordContext();
    currentTable   = ctx.table;
    currentSysId   = ctx.sys_id;
    currentDisplay = getDisplayLabel();

    var overlay = document.createElement('div');
    overlay.id = 'zevox-overlay-' + AGENT_ID;
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:9998;opacity:0;transition:opacity .2s;pointer-events:none';
    document.body.appendChild(overlay);
    setTimeout(function () { overlay.style.opacity = '1'; overlay.style.pointerEvents = 'auto'; }, 10);
    overlay.onclick = closePanel;

    var panel = document.createElement('div');
    panel.id = 'zevox-panel-' + AGENT_ID;
    panel.style.cssText = [
      'position:fixed;top:0;right:0;bottom:0;width:380px;background:#fff',
      'box-shadow:-4px 0 24px rgba(0,0,0,.18);z-index:9999',
      'display:flex;flex-direction:column',
      'transform:translateX(100%);transition:transform .25s cubic-bezier(.22,1,.36,1)'
    ].join(';');

    var iframe = document.createElement('iframe');
    iframe.src = buildIframeSrc(currentTable, currentSysId, currentDisplay);
    iframe.style.cssText = 'flex:1;border:none;width:100%;height:100%';
    iframe.allow = 'microphone';
    panel.appendChild(iframe);

    document.body.appendChild(panel);
    setTimeout(function () { panel.style.transform = 'translateX(0)'; }, 10);

    panelEl = panel;
    panelOpen = true;
  }

  function closePanel() {
    if (!panelEl) return;
    var overlay = document.getElementById('zevox-overlay-' + AGENT_ID);
    var panel = panelEl;
    panel.style.transform = 'translateX(100%)';
    if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    setTimeout(function () {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 280);
    panelEl = null;
    panelOpen = false;
  }

  function togglePanel() {
    if (panelOpen) { closePanel(); } else { createPanel(); }
  }

  function injectButton() {
    var btnId = 'zevox-btn-' + AGENT_ID;
    if (document.getElementById(btnId)) return;

    // Only inject when on a table this panel is configured for
    var ctx = getRecordContext();
    if (TABLES.length && !tableAllowed(ctx.table)) return;

    var rail = document.querySelector(
      '.workspace-sidebar-actions, .now-workspace-sidebar, ' +
      '[data-component="workspace-sidebar"], .sidebar-rail, ' +
      '.sn-sidebar__actions, [aria-label="Sidebar actions"]'
    );

    var btn = document.createElement('button');
    btn.id = btnId;
    btn.title = '${escapeXml(agentLabel)}';
    btn.setAttribute('aria-label', 'Open ${escapeXml(agentLabel)} panel');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

    if (rail) {
      btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:8px;background:transparent;color:#64748b;cursor:pointer;margin:4px auto;transition:background .15s,color .15s';
      btn.onmouseenter = function () { btn.style.background = '#f1f5f9'; btn.style.color = '#0f172a'; };
      btn.onmouseleave = function () { btn.style.background = 'transparent'; btn.style.color = '#64748b'; };
      rail.appendChild(btn);
    } else {
      btn.style.cssText = [
        'position:fixed;bottom:80px;right:16px;z-index:9997',
        'width:44px;height:44px;border-radius:50%;border:none',
        'background:#0f172a;color:#fff;cursor:pointer',
        'display:flex;align-items:center;justify-content:center',
        'box-shadow:0 4px 16px rgba(0,0,0,.3);transition:transform .15s'
      ].join(';');
      btn.onmouseenter = function () { btn.style.transform = 'scale(1.08)'; };
      btn.onmouseleave = function () { btn.style.transform = 'scale(1)'; };
      document.body.appendChild(btn);
    }

    btn.onclick = togglePanel;
  }

  function removeButton() {
    var btn = document.getElementById('zevox-btn-' + AGENT_ID);
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  var lastHref = window.location.href;
  setInterval(function () {
    var href = window.location.href;
    if (href !== lastHref) {
      lastHref = href;
      setTimeout(function () {
        var ctx = getRecordContext();
        // Update record context in open panel
        if (ctx.table !== currentTable || ctx.sys_id !== currentSysId) {
          currentTable   = ctx.table;
          currentSysId   = ctx.sys_id;
          currentDisplay = getDisplayLabel();
          postRecordToPanel(currentTable, currentSysId, currentDisplay);
        }
        // Show/hide button based on whether this table is configured
        if (TABLES.length && !tableAllowed(ctx.table)) {
          removeButton();
          if (panelOpen) closePanel();
        } else {
          injectButton();
        }
      }, 600);
    }
  }, 500);

  var attempts = 0;
  var initTimer = setInterval(function () {
    injectButton();
    attempts++;
    if (attempts >= 20) clearInterval(initTimer);
  }, 500);

  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
      var ctx = getRecordContext();
      if (TABLES.length && !tableAllowed(ctx.table)) return;
      e.preventDefault();
      togglePanel();
    }
  });
})();
]]></script>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}uisc001</sys_id>
    <sys_update_name>sys_ui_script_ZeVox_${escapeXml(agentId.replace(/[^a-zA-Z0-9]/g, '_'))}</sys_update_name>
  </sys_ui_script>

</unload>`
}

function escapeXml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
