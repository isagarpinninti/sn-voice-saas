/**
 * GET /api/admin/downloads?file=kb-rerank-patch
 *
 * Admin-only endpoint that serves downloadable SN update set patches.
 * Currently supports:
 *   ?file=kb-rerank-patch  — patches AiVoiceKbSearcher to use llama-3.2-3b-preview
 */
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const file = req.nextUrl.searchParams.get('file')

  if (file === 'kb-rerank-patch') {
    const xml = buildKbRerankPatchXml()
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': 'attachment; filename="zevox-kb-rerank-patch.xml"',
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({ error: 'Unknown file. Supported: kb-rerank-patch' }, { status: 400 })
}

function buildKbRerankPatchXml(): string {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  return `<?xml version="1.0" encoding="UTF-8"?>
<unload unload_date="${now}">
  <sys_update_set action="INSERT_OR_UPDATE">
    <application display_value="AI Voice Agent">eaf4191f0e074fba9cc08a4b05f91a81</application>
    <description>Patches AiVoiceKbSearcher: replaces deprecated llama-3.1-8b-instant with llama-3.2-3b-preview for KB article reranking.</description>
    <name>ZeVox KB Rerank Model Patch</name>
    <release_date>${now.substring(0, 10)}</release_date>
    <state>complete</state>
    <sys_created_by>admin</sys_created_by>
    <sys_id>zevoxkbrerank20250630patch001</sys_id>
  </sys_update_set>

  <sys_script_include action="INSERT_OR_UPDATE">
    <sys_id>034bbcf7932c470389d7862428722bcb</sys_id>
    <sys_scope display_value="x_ztpas_ai_voice_a">eaf4191f0e074fba9cc08a4b05f91a81</sys_scope>
    <sys_update_name>sys_script_include_034bbcf7932c470389d7862428722bcb</sys_update_name>
    <access>package_private</access>
    <active>true</active>
    <api_name>x_ztpas_ai_voice_a.AiVoiceKbSearcher</api_name>
    <caller_access/>
    <client_callable>false</client_callable>
    <description>Two-layer KB search: keyword matching + relevance ranking + deduplication</description>
    <mobile_callable>false</mobile_callable>
    <name>AiVoiceKbSearcher</name>
    <sandbox_callable>false</sandbox_callable>
    <script><![CDATA[/**
 * AiVoiceKbSearcher - Two-layer KB search for token-efficient retrieval
 * Layer 1: Keyword-based search on cached chunks (no LLM cost)
 * Layer 2: Relevance ranking with deduplication and recency scoring
 *
 * @class AiVoiceKbSearcher
 * @memberof x_ztpas_ai_voice_a
 */
var AiVoiceKbSearcher = Class.create();
AiVoiceKbSearcher.prototype = {
    initialize: function () {
        this.utils = new x_ztpas_ai_voice_a.AiVoiceUtils();
        this.maxChunksPerQuery = parseInt(gs.getProperty('x_ztpas_ai_voice_a.kb_cache.max_chunks_per_query', '3'));
    },

    /**
     * Search KB cache for relevant chunks based on user query
     * @param {string} agentSysId - sys_id of the voice agent
     * @param {string} userQuery - The user's question or message
     * @returns {object[]} Array of relevant chunks: [{ title, number, content, summary }]
     */
    search: function (agentSysId, userQuery) {
        if (!userQuery || userQuery.trim().length < 3) return [];

        // Skip search for conversational filler
        if (this.utils.isConversationalFiller(userQuery)) return [];

        var linkedKbs = this._getAgentKnowledgeBases(agentSysId);
        if (linkedKbs.length === 0) return [];

        var searchTerms = this._extractSearchTerms(userQuery);
        if (searchTerms.length === 0) return [];

        // Expand search terms with basic synonyms
        var expandedTerms = this._expandTerms(searchTerms);

        // Layer 1: Keyword search on cached chunks (uses original, unexpanded
        // terms for the initial fetch — synonyms are reserved for scoring).
        var candidates = this._keywordSearch(linkedKbs, searchTerms);
        if (candidates.length === 0) return [];

        // Runtime guard: even if the kb_cache was populated with a draft or
        // since-retired article (stale processor, edited after cache write),
        // make sure we never return unpublished content to a caller. Per-user
        // can_read ACLs are NOT enforced here — kb_cache is a shared cache
        // keyed by agent, not by caller. Treat the agent's linked KB list as
        // the authorization surface.
        candidates = this._filterToPublishedArticles(candidates);
        if (candidates.length === 0) return [];

        // Multi-term filter: when the query has >=2 meaningful terms, require
        // at least 2 term matches in searchable fields. Prevents a single
        // common-word match (e.g. "connection") from flooding results.
        if (searchTerms.length >= 2) {
            candidates = this._filterByTermCoverage(candidates, searchTerms, 2);
        }
        if (candidates.length === 0) return [];

        // Layer 2: Rank (uses expanded terms so synonyms still score), dedup
        var ranked = this._rankByRelevance(candidates, expandedTerms, searchTerms);
        var deduped = this._deduplicateByArticle(ranked);

        // Layer 3: LLM rerank on top candidates for semantic accuracy.
        // Lexical ranking is noisy — the LLM picks which article actually
        // answers the question. Falls back to lexical order on any failure.
        // Pool=8 (balance quality vs latency). Skip when <=1 candidate.
        var rerankPool = deduped.slice(0, 8);
        var reranked = this._rerankWithLLM(agentSysId, userQuery, rerankPool);
        var topChunks = reranked.slice(0, this.maxChunksPerQuery);

        this.utils.logDebug('KB search returned ' + topChunks.length + ' chunks for: ' + this.utils.truncate(userQuery, 80));
        return topChunks;
    },

    /**
     * Ask a small LLM to pick the best-matching articles from the top
     * keyword-ranked candidates. Reuses the agent's existing llm_config
     * (same API key + base URL) but forces llama-3.2-3b-preview for
     * cost/latency. Returns keyword-ranked candidates on any failure.
     * @private
     */
    _rerankWithLLM: function (agentSysId, userQuery, candidates) {
        if (!candidates || candidates.length <= 1) return candidates;

        var llmConfig = this._loadLlmConfigForAgent(agentSysId);
        if (!llmConfig || !llmConfig.api_key || !llmConfig.base_url) {
            this.utils.logDebug('KB rerank: LLM config unavailable, using keyword ranking');
            return candidates;
        }

        // Keep prompt tight — llama-3.2-3b-preview at low latency is the goal. Short
        // summaries (100 chars) give the model enough context to judge
        // relevance from the title + a teaser, without bloating the prompt.
        var lines = [
            'User problem: "' + this.utils.truncate(userQuery, 150) + '"',
            '',
            'Candidates:'
        ];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var summary = ((c.summary || c.content || '') + '').replace(/\s+/g, ' ').substring(0, 100);
            lines.push('[' + i + '] ' + (c.title || 'Untitled') + (summary ? ' — ' + summary : ''));
        }
        lines.push('');
        lines.push('Pick up to 3 indices whose TITLES directly address the problem. Reply with comma-separated numbers (e.g. "2,0") or exactly "none" if nothing fits. When unsure, reply "none".');

        var body = {
            model: 'llama-3.2-3b-preview',
            messages: [
                { role: 'system', content: 'Strict relevance judge. Pick articles only if their title solves the problem. Reply with indices or "none" — nothing else.' },
                { role: 'user', content: lines.join('\n') }
            ],
            temperature: 0,
            max_tokens: 12
        };

        try {
            var endpoint = (llmConfig.base_url + '').replace(/\/+$/, '');
            if (endpoint.indexOf('/chat/completions') === -1) endpoint += '/chat/completions';

            var req = new sn_ws.RESTMessageV2();
            req.setEndpoint(endpoint);
            req.setHttpMethod('POST');
            req.setRequestHeader('Authorization', 'Bearer ' + llmConfig.api_key);
            req.setRequestHeader('Content-Type', 'application/json');
            req.setRequestBody(JSON.stringify(body));
            req.setHttpTimeout(1200);

            var res = req.execute();
            var status = res.getStatusCode();
            if (status != 200) {
                this.utils.logDebug('KB rerank: LLM returned ' + status + ' — falling back');
                return candidates;
            }

            var parsed = JSON.parse(res.getBody() || '{}');
            var content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
            if (!content) return candidates;

            content = (content + '').trim().toLowerCase();
            if (content === 'none') return [];

            var raw = content.split(/[^0-9]+/);
            var indices = [];
            for (var r = 0; r < raw.length; r++) {
                var n = parseInt(raw[r], 10);
                if (!isNaN(n) && n >= 0 && n < candidates.length) indices.push(n);
            }
            if (indices.length === 0) return candidates;

            // Dedupe indices preserving LLM order
            var seen = {};
            var reranked = [];
            for (var j = 0; j < indices.length; j++) {
                if (!seen[indices[j]]) {
                    seen[indices[j]] = true;
                    reranked.push(candidates[indices[j]]);
                }
            }
            this.utils.logDebug('KB rerank: LLM selected ' + reranked.length + ' of ' + candidates.length);
            return reranked;
        } catch (e) {
            this.utils.logDebug('KB rerank error: ' + e.message + ' — falling back to keyword ranking');
            return candidates;
        }
    },

    /**
     * Load LLM API key + base URL from the agent's linked llm_config.
     * @private
     */
    _loadLlmConfigForAgent: function (agentSysId) {
        var agent = new GlideRecord('x_ztpas_ai_voice_a_voice_agent');
        if (!agent.get(agentSysId)) return null;
        var configSysId = agent.getValue('llm_config');
        if (!configSysId) return null;

        var cfg = new GlideRecord('x_ztpas_ai_voice_a_llm_config');
        if (!cfg.get(configSysId)) return null;
        var active = cfg.getValue('active');
        if (active !== 'true' && active !== '1') return null;

        return {
            api_key: cfg.api_key.getDecryptedValue(),
            base_url: cfg.getValue('api_endpoint') || ''
        };
    },

    /**
     * Get knowledge bases linked to an agent
     * @private
     */
    _getAgentKnowledgeBases: function (agentSysId) {
        var kbs = [];
        var gr = new GlideRecord('x_ztpas_ai_voice_a_agent_knowledge');
        gr.addQuery('agent', agentSysId);
        gr.addQuery('active', true);
        gr.orderBy('search_priority');
        gr.query();

        while (gr.next()) {
            kbs.push({
                knowledge_base: gr.getValue('knowledge_base'),
                kb_category: gr.getValue('kb_category'),
                priority: parseInt(gr.getValue('search_priority') || '100'),
                max_articles: parseInt(gr.getValue('max_articles') || '10')
            });
        }
        return kbs;
    },

    /**
     * Extract meaningful search terms from user query
     * @private
     */
    _extractSearchTerms: function (userQuery) {
        var stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'have', 'has',
            'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'to', 'of',
            'in', 'for', 'on', 'with', 'at', 'by', 'from', 'and', 'but', 'or', 'not',
            'so', 'if', 'when', 'who', 'this', 'that', 'it',
            'you', 'your', 'we', 'our', 'they', 'their', 'my', 'me', 'am',
            'tell', 'help', 'need', 'want', 'please', 'know', 'about', 'get', 'like',
            'just', 'also', 'been', 'being', 'had', 'some', 'there', 'these', 'those',
            'actually', 'really', 'basically', 'kinda', 'sorta', 'maybe',
            'issue', 'issues', 'problem', 'problems', 'trouble', 'troubles',
            'having', 'getting', 'trying', 'going', 'doing', 'looking', 'thinking',
            'anything', 'something', 'stuff', 'thing', 'things',
            'try', 'find', 'search', 'show', 'give', 'make', 'take', 'come'];

        var words = userQuery.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
        var terms = [];

        for (var i = 0; i < words.length; i++) {
            var word = words[i].trim();
            if (word.length > 2 && stopWords.indexOf(word) === -1) {
                terms.push(word);
            }
        }

        return terms;
    },

    /**
     * Expand search terms with basic synonyms and related terms
     * @private
     */
    _expandTerms: function (terms) {
        var synonymMap = {
            'password': ['password', 'pwd', 'passwd'],
            'login': ['login', 'log-in', 'signin', 'sign-in'],
            'email': ['email', 'e-mail', 'mail'],
            'wifi': ['wifi', 'wi-fi', 'wireless'],
            'laptop': ['laptop', 'notebook'],
            'install': ['install', 'installation'],
            'configure': ['configure', 'configuration', 'setup']
        };

        var expanded = terms.slice();
        for (var i = 0; i < terms.length; i++) {
            if (synonymMap[terms[i]]) {
                var synonyms = synonymMap[terms[i]];
                for (var s = 0; s < synonyms.length; s++) {
                    if (expanded.indexOf(synonyms[s]) === -1) {
                        expanded.push(synonyms[s]);
                    }
                }
            }
        }

        return expanded;
    },

    /**
     * Layer 1: Keyword-based search on KB cache.
     * @private
     */
    _keywordSearch: function (linkedKbs, searchTerms) {
        var candidates = [];
        var kbFilter = [];

        for (var k = 0; k < linkedKbs.length; k++) {
            kbFilter.push(linkedKbs[k].knowledge_base);
        }

        var gr = new GlideRecord('x_ztpas_ai_voice_a_kb_cache');
        gr.addQuery('knowledge_base', 'IN', kbFilter.join(','));
        gr.addQuery('active', true);
        gr.addQuery('stale', false);

        var searchQuery = gr.addQuery('keywords', 'CONTAINS', searchTerms[0]);
        searchQuery.addOrCondition('article_title', 'CONTAINS', searchTerms[0]);
        searchQuery.addOrCondition('chunk_summary', 'CONTAINS', searchTerms[0]);

        for (var t = 1; t < Math.min(searchTerms.length, 8); t++) {
            searchQuery.addOrCondition('keywords', 'CONTAINS', searchTerms[t]);
            searchQuery.addOrCondition('article_title', 'CONTAINS', searchTerms[t]);
            searchQuery.addOrCondition('chunk_summary', 'CONTAINS', searchTerms[t]);
        }

        gr.setLimit(50);
        gr.query();

        while (gr.next()) {
            candidates.push({
                sys_id: gr.getUniqueValue(),
                title: gr.getValue('article_title'),
                number: gr.getValue('article_number'),
                content: gr.getValue('chunk_text'),
                summary: gr.getValue('chunk_summary'),
                keywords: gr.getValue('keywords'),
                chunk_index: parseInt(gr.getValue('chunk_index')),
                token_count: parseInt(gr.getValue('token_count') || '0'),
                kb_sys_id: gr.getValue('knowledge_base'),
                article_sys_id: gr.getValue('knowledge_article'),
                last_processed: gr.getValue('last_processed_at'),
                relevance_score: parseInt(gr.getValue('relevance_score') || '50')
            });
        }

        return candidates;
    },

    /**
     * Drop candidates whose backing kb_knowledge article is not published.
     * @private
     */
    _filterToPublishedArticles: function (candidates) {
        if (!candidates || candidates.length === 0) return candidates;

        var ids = [];
        var seen = {};
        for (var i = 0; i < candidates.length; i++) {
            var aid = candidates[i].article_sys_id;
            if (aid && !seen[aid]) { ids.push(aid); seen[aid] = true; }
        }
        if (ids.length === 0) return [];

        var published = {};
        var gr = new GlideRecord('kb_knowledge');
        gr.addQuery('sys_id', 'IN', ids.join(','));
        gr.addQuery('workflow_state', 'published');
        gr.query();
        while (gr.next()) { published[gr.getUniqueValue()] = true; }

        var out = [];
        for (var j = 0; j < candidates.length; j++) {
            if (published[candidates[j].article_sys_id]) out.push(candidates[j]);
        }
        return out;
    },

    /**
     * Drop candidates that don't match at least minMatches distinct terms.
     * @private
     */
    _filterByTermCoverage: function (candidates, searchTerms, minMatches) {
        var filtered = [];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var searchable = ((c.title || '') + ' ' + (c.keywords || '') + ' ' + (c.summary || '')).toLowerCase();
            var matched = 0;
            for (var t = 0; t < searchTerms.length; t++) {
                if (searchable.indexOf(searchTerms[t]) !== -1) matched++;
                if (matched >= minMatches) break;
            }
            if (matched >= minMatches) filtered.push(c);
        }
        return filtered;
    },

    /**
     * Layer 2: Rank candidates by relevance score
     * @private
     */
    _rankByRelevance: function (candidates, expandedTerms, originalTerms) {
        var now = new GlideDateTime();
        for (var i = 0; i < candidates.length; i++) {
            candidates[i].score = this._calculateRelevanceScore(candidates[i], expandedTerms, originalTerms || expandedTerms, now);
        }

        candidates.sort(function (a, b) {
            return b.score - a.score;
        });

        return candidates;
    },

    /**
     * Calculate relevance score for a candidate chunk
     * @private
     */
    _calculateRelevanceScore: function (candidate, expandedTerms, originalTerms, now) {
        var score = 0;
        var title = (candidate.title || '').toLowerCase();
        var keywords = (candidate.keywords || '').toLowerCase();
        var content = (candidate.content || '').toLowerCase();
        var searchableText = title + ' ' + keywords + ' ' + content;

        for (var i = 0; i < expandedTerms.length; i++) {
            var term = expandedTerms[i];

            if (title.indexOf(term) !== -1) score += 20;
            if (keywords.indexOf(term) !== -1) score += 8;

            if (content.indexOf(term) !== -1) {
                score += 1;
                var regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                var matches = content.match(regex);
                if (matches && matches.length > 1) {
                    score += Math.min(matches.length - 1, 3);
                }
            }
        }

        var allInTitle = true;
        for (var a = 0; a < originalTerms.length; a++) {
            if (title.indexOf(originalTerms[a]) === -1) { allInTitle = false; break; }
        }
        if (allInTitle && originalTerms.length > 0) score += 40;

        var uniqueOriginalMatched = 0;
        for (var j = 0; j < originalTerms.length; j++) {
            if (searchableText.indexOf(originalTerms[j]) !== -1) uniqueOriginalMatched++;
        }
        score += uniqueOriginalMatched * 5;

        if (candidate.chunk_index === 0) score += 2;
        else if (candidate.chunk_index === 1) score += 1;

        if (candidate.last_processed && now) {
            var processedDate = new GlideDateTime(candidate.last_processed);
            var daysSinceProcessed = gs.dateDiff(processedDate.toString(), now.toString(), true);
            var daysNum = Math.abs(parseInt(daysSinceProcessed) / 86400);
            if (daysNum < 7) score += 3;
            else if (daysNum < 30) score += 1;
        }

        if (typeof candidate.relevance_score === 'number') {
            score += (candidate.relevance_score - 50) / 10;
        }

        return score;
    },

    /**
     * Adjust relevance scores on a set of chunks.
     */
    adjustRelevance: function (chunkSysIds, delta) {
        if (!chunkSysIds || chunkSysIds.length === 0 || !delta) return 0;
        var updated = 0;
        for (var i = 0; i < chunkSysIds.length; i++) {
            var id = chunkSysIds[i];
            if (!id) continue;
            var gr = new GlideRecord('x_ztpas_ai_voice_a_kb_cache');
            if (!gr.get(id)) continue;
            var current = parseInt(gr.getValue('relevance_score') || '50');
            var next = current + delta;
            if (next < 0) next = 0;
            if (next > 100) next = 100;
            if (next !== current) {
                gr.setValue('relevance_score', next);
                gr.update();
                updated++;
            }
        }
        return updated;
    },

    /**
     * Deduplicate chunks — keep only the best-scoring chunk per article.
     * @private
     */
    _deduplicateByArticle: function (rankedCandidates) {
        var seenArticles = {};
        var deduped = [];

        for (var i = 0; i < rankedCandidates.length; i++) {
            var c = rankedCandidates[i];
            var articleKey = c.article_sys_id || c.number;

            if (!seenArticles[articleKey]) {
                seenArticles[articleKey] = true;
                deduped.push(c);
            }
        }

        return deduped;
    },

    type: 'AiVoiceKbSearcher'
};
]]></script>
    <sys_policy/>
  </sys_script_include>

</unload>`
}
