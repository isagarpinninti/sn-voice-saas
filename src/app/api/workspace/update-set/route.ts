export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

// Returns a downloadable ServiceNow Update Set XML that installs the
// ZeVox workspace sidebar panel. The XML is customised with the tenant's
// API token and the SaaS server URL so the SN admin just imports it and
// the panel works immediately.

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await db.tenant.findFirst({
    where: { user: { email: session.user.email } },
    include: { apiTokens: { where: { active: true }, take: 1 } },
  })

  if (!tenant) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  const token = tenant.apiTokens[0]?.token || ''
  const serverUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'
  const panelUrl = `${serverUrl}/panel`

  const xml = buildUpdateSetXml({ token, serverUrl, panelUrl })

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zevox-workspace-panel.xml"',
      'Cache-Control': 'no-store',
    },
  })
}

function buildUpdateSetXml({ token, serverUrl, panelUrl }: { token: string; serverUrl: string; panelUrl: string }) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  // Unique but stable IDs based on server URL so re-downloads don't create duplicates
  const hash = serverUrl.replace(/[^a-z0-9]/gi, '').substring(0, 12).toLowerCase()

  return `<?xml version="1.0" encoding="UTF-8"?>
<unload unload_date="${now}">
  <sys_update_set action="INSERT_OR_UPDATE">
    <application display_value="Global">global</application>
    <description>ZeVox AI workspace sidebar panel. Adds a slide-in voice+chat panel to any workspace record form, passing the current record context to the ZeVox AI agent.</description>
    <name>ZeVox Workspace Panel</name>
    <release_date>${now.substring(0,10)}</release_date>
    <state>complete</state>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}updateset001</sys_id>
  </sys_update_set>

  <!-- System property: ZeVox API token -->
  <sys_properties action="INSERT_OR_UPDATE">
    <description>ZeVox SaaS API token. Found in ZeVox Dashboard → API Tokens.</description>
    <name>zevox.workspace.token</name>
    <private>true</private>
    <read_roles/>
    <suffix/>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}prop001</sys_id>
    <sys_update_name>sys_properties_zevox.workspace.token</sys_update_name>
    <type>string</type>
    <value>${escapeXml(token)}</value>
    <write_roles>admin</write_roles>
  </sys_properties>

  <!-- System property: ZeVox server URL -->
  <sys_properties action="INSERT_OR_UPDATE">
    <description>ZeVox SaaS server URL. Do not change unless using a custom deployment.</description>
    <name>zevox.workspace.url</name>
    <private>false</private>
    <read_roles/>
    <suffix/>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}prop002</sys_id>
    <sys_update_name>sys_properties_zevox.workspace.url</sys_update_name>
    <type>string</type>
    <value>${escapeXml(serverUrl)}</value>
    <write_roles>admin</write_roles>
  </sys_properties>

  <!-- System property: optional agent ID override -->
  <sys_properties action="INSERT_OR_UPDATE">
    <description>Optional ZeVox Agent ID to force a specific agent in the workspace panel. Leave blank to use the default orchestrator agent selection.</description>
    <name>zevox.workspace.agent</name>
    <private>false</private>
    <read_roles/>
    <suffix/>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}prop003</sys_id>
    <sys_update_name>sys_properties_zevox.workspace.agent</sys_update_name>
    <type>string</type>
    <value></value>
    <write_roles>admin</write_roles>
  </sys_properties>

  <!-- UI Script: injects the ZeVox panel into Agent Workspace and Next Experience -->
  <sys_ui_script action="INSERT_OR_UPDATE">
    <active>true</active>
    <description>Injects the ZeVox AI sidebar panel into ServiceNow Agent Workspace and Next Experience workspaces. Opens as a slide-in panel with the current record context passed automatically.</description>
    <global>true</global>
    <name>ZeVoxWorkspacePanel</name>
    <script><![CDATA[
(function () {
  'use strict';

  // Only run in workspace contexts
  var path = window.location.pathname || '';
  var isWorkspace = path.indexOf('/now/workspace') !== -1 ||
                    path.indexOf('/now/unified-agent') !== -1 ||
                    path.indexOf('/now/nav/ui') !== -1;
  if (!isWorkspace) return;

  // Read config from sys_properties (injected as g_ck globals by SN)
  var TOKEN = (typeof g_ck !== 'undefined' && window['zevox_token']) ||
              '${escapeXml(token)}';
  var SERVER_URL = '${escapeXml(serverUrl)}';
  var AGENT_ID = '';
  var PANEL_URL = SERVER_URL + '/panel';

  var panelOpen = false;
  var panelEl = null;
  var currentTable = '';
  var currentSysId = '';
  var currentDisplay = '';

  function getRecordContext() {
    try {
      // Extract table and sys_id from URL
      // Workspace URLs: /now/workspace/.../form/<table>/<sys_id>
      //                 /now/unified-agent/.../record/<table>/<sys_id>
      var m = window.location.href.match(/\/(?:form|record)\/([^/]+)\/([a-f0-9]{32})/i);
      if (m) return { table: m[1], sys_id: m[2] };
      // Fallback: try hash-based routing
      var hm = window.location.hash.match(/\/(?:form|record)\/([^/]+)\/([a-f0-9]{32})/i);
      if (hm) return { table: hm[1], sys_id: hm[2] };
    } catch (e) {}
    return { table: '', sys_id: '' };
  }

  function getDisplayLabel() {
    try {
      // Try to get the record number/title from the page heading
      var h = document.querySelector('[data-field="number"] .sn-widget-textblock_value, .record-header .record-number, [aria-label*="INC"], [aria-label*="REQ"], [aria-label*="TASK"], [aria-label*="CS"]');
      if (h) return h.textContent.trim();
      var title = document.querySelector('.workspace-header__title, .record-header__title, .page-header .title');
      if (title) return title.textContent.trim().substring(0, 60);
    } catch (e) {}
    return '';
  }

  function buildIframeSrc(table, sys_id, display) {
    var src = PANEL_URL +
      '?token=' + encodeURIComponent(TOKEN) +
      (AGENT_ID ? '&agent=' + encodeURIComponent(AGENT_ID) : '') +
      (table ? '&table=' + encodeURIComponent(table) : '') +
      (sys_id ? '&sys_id=' + encodeURIComponent(sys_id) : '') +
      (display ? '&display=' + encodeURIComponent(display) : '') +
      '&_t=' + Date.now();
    return src;
  }

  function postRecordToPanel(table, sys_id, display) {
    if (!panelEl) return;
    var iframe = panelEl.querySelector('iframe');
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({
        type: 'zevox_record',
        table: table,
        sys_id: sys_id,
        display: display
      }, '*');
    } catch (e) {}
  }

  function createPanel() {
    var ctx = getRecordContext();
    currentTable = ctx.table;
    currentSysId = ctx.sys_id;
    currentDisplay = getDisplayLabel();

    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'zevox-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:9998;opacity:0;transition:opacity .2s;pointer-events:none';
    document.body.appendChild(overlay);
    setTimeout(function () { overlay.style.opacity = '1'; overlay.style.pointerEvents = 'auto'; }, 10);
    overlay.onclick = closePanel;

    // Slide-in panel
    var panel = document.createElement('div');
    panel.id = 'zevox-panel';
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
    var overlay = document.getElementById('zevox-overlay');
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
    if (document.getElementById('zevox-panel-btn')) return;

    // Find the workspace right sidebar rail or fall back to a fixed position button
    var rail = document.querySelector(
      '.workspace-sidebar-actions, .now-workspace-sidebar, ' +
      '[data-component="workspace-sidebar"], .sidebar-rail, ' +
      '.sn-sidebar__actions, [aria-label="Sidebar actions"]'
    );

    var btn = document.createElement('button');
    btn.id = 'zevox-panel-btn';
    btn.title = 'ZeVox AI Assistant';
    btn.setAttribute('aria-label', 'Open ZeVox AI panel');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

    if (rail) {
      btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:8px;background:transparent;color:#64748b;cursor:pointer;margin:4px auto;transition:background .15s,color .15s';
      btn.onmouseenter = function () { btn.style.background = '#f1f5f9'; btn.style.color = '#0f172a'; };
      btn.onmouseleave = function () { btn.style.background = 'transparent'; btn.style.color = '#64748b'; };
      rail.appendChild(btn);
    } else {
      // Floating fallback if sidebar rail not found
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

  // Watch for route changes (SPA navigation) and update record context
  var lastHref = window.location.href;
  setInterval(function () {
    var href = window.location.href;
    if (href !== lastHref) {
      lastHref = href;
      setTimeout(function () {
        var ctx = getRecordContext();
        if (ctx.table !== currentTable || ctx.sys_id !== currentSysId) {
          currentTable = ctx.table;
          currentSysId = ctx.sys_id;
          currentDisplay = getDisplayLabel();
          postRecordToPanel(currentTable, currentSysId, currentDisplay);
        }
        // Re-inject button if SPA re-rendered the sidebar
        injectButton();
      }, 600);
    }
  }, 500);

  // Initial injection with retry (workspace loads async)
  var attempts = 0;
  var initTimer = setInterval(function () {
    injectButton();
    attempts++;
    if (attempts >= 20) clearInterval(initTimer);
  }, 500);

  // Keyboard shortcut: Alt+Z
  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      togglePanel();
    }
  });
})();
]]></script>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevox${hash}uiscript01</sys_id>
    <sys_update_name>sys_ui_script_ZeVoxWorkspacePanel</sys_update_name>
  </sys_ui_script>

</unload>`
}

function escapeXml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
