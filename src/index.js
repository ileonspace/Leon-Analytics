/**
 * Leon Analytics
 * A lightweight, privacy-friendly website traffic analytics system.
 * Built on Cloudflare Workers + D1 Database.
 * License: MIT
 */

const BLOCKED_SITE_IDS = ["broadcast"]; // 屏蔽的站点ID列表

export default {
  async fetch(request, env) {
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS 配置，允许跨域访问以便被其他网站调用
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    // 处理预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API: 上报数据 (POST)
    if (path === "/api/track" && request.method === "POST") {
      try {
        if (!env.DB) throw new Error("Server Error: env.DB is not defined.");
        
        const data = await request.json();
        const country = request.cf?.country || "Unknown";
        const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
        // 如果未提供 site_id，默认为 'default'
        const siteId = data.site_id && data.site_id.trim() !== "" ? data.site_id : "default";
        
        // 检查屏蔽列表
        if (BLOCKED_SITE_IDS.includes(siteId)) {
          return new Response(JSON.stringify({ status: "ignored" }), { 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }

        // 写入数据库
        await env.DB.prepare(
          `INSERT INTO visits (site_id, ip, country, path) VALUES (?, ?, ?, ?)`
        ).bind(siteId, ip, country, data.path || "/").run();

        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // API: 获取统计数据 (GET)
    if (path === "/api/stats") {
      try {
        if (!ADMIN_PASSWORD) throw new Error("Server Config Error: ADMIN_PASSWORD not set.");
        
        const authHeader = request.headers.get("Authorization");
        if (authHeader !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
        }
        
        if (!env.DB) throw new Error("Database Error: env.DB undefined");

        const siteFilter = url.searchParams.get("site_id");
        let whereClause = "";
        let params = [];

        // 筛选逻辑
        if (siteFilter && siteFilter !== "all") {
          whereClause = "WHERE site_id = ?";
          params = [siteFilter];
        }

        // 并行查询数据
        const [totalResult, uniqueResult, countriesResult, recentResult, sitesResult, topSitesResult] = await Promise.all([
          // 1. 总访问量 (PV)
          env.DB.prepare(`SELECT COUNT(*) as count FROM visits ${whereClause}`).bind(...params).first(),
          // 2. 独立访客 (UV)
          env.DB.prepare(`SELECT COUNT(DISTINCT ip) as count FROM visits ${whereClause}`).bind(...params).first(),
          // 3. 国家排行
          env.DB.prepare(`SELECT country, COUNT(*) as count FROM visits ${whereClause} GROUP BY country ORDER BY count DESC LIMIT 50`).bind(...params).all(),
          // 4. 最近记录
          env.DB.prepare(`SELECT * FROM visits ${whereClause} ORDER BY id DESC LIMIT 100`).bind(...params).all(),
          // 5. 站点列表
          env.DB.prepare(`SELECT DISTINCT site_id FROM visits ORDER BY site_id ASC`).all(),
          // 6. 热门站点
          env.DB.prepare(`SELECT site_id, COUNT(*) as count FROM visits GROUP BY site_id ORDER BY count DESC LIMIT 100`).all()
        ]);

        return new Response(JSON.stringify({
          total: totalResult?.count || 0,
          unique: uniqueResult?.count || 0,
          countries: countriesResult.results || [],
          recent: recentResult.results || [],
          sites: sitesResult.results.map((r) => r.site_id),
          topSites: topSitesResult.results || []
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 首页: 返回 Dashboard HTML
    if (path === "/") {
      return new Response(htmlDashboard, {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};

// 前端 Dashboard HTML 代码
const htmlDashboard = `
<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Leon Stats</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/jsvectormap/1.5.3/css/jsvectormap.min.css" />

    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        dark: { bg: '#0f172a', card: 'rgba(30, 41, 59, 0.65)', border: 'rgba(255,255,255,0.08)' },
                        light: { bg: '#f8fafc', card: 'rgba(255, 255, 255, 0.9)', border: 'rgba(0,0,0,0.05)' }
                    },
                    fontFamily: {
                        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
                        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Menlo', 'monospace'],
                    },
                    fontSize: { 'xxs': '0.65rem' }
                }
            }
        }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; transition: background-color 0.4s ease, color 0.4s ease; -webkit-font-smoothing: antialiased; }
        .font-mono { font-family: 'JetBrains Mono', monospace; letter-spacing: -0.02em; }
        .ambient-light { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; transition: opacity 0.5s ease; }
        .dark .ambient-light { background: radial-gradient(circle at 10% 20%, rgba(79, 70, 229, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 40%); opacity: 1; }
        .light .ambient-light { background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.03) 0%, transparent 60%); opacity: 1; }

        .glass-card { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid; border-radius: 12px; }
        .dark .glass-card { background: var(--card-bg); border-color: var(--border); box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .light .glass-card { background: rgba(255, 255, 255, 0.8); border-color: rgba(0,0,0,0.06); box-shadow: 0 4px 15px rgba(0,0,0,0.03); }

        .toggle-checkbox { display: none; }
        .toggle-track { 
            width: 3rem; height: 1.5rem; 
            background-color: #e2e8f0; 
            border-radius: 9999px; 
            position: relative; 
            transition: background-color 0.3s ease; 
            border: 1px solid rgba(0,0,0,0.05);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);
        }
        .dark .toggle-track { 
            background-color: #334155; 
            border-color: rgba(255,255,255,0.1);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .toggle-checkbox:checked + .toggle-track { background-color: #4f46e5; }
        
        .toggle-knob {
            width: 1.2rem; height: 1.2rem;
            background-color: white;
            border-radius: 50%;
            position: absolute;
            top: 2px; left: 2px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
            z-index: 10;
        }
        .toggle-checkbox:checked + .toggle-track .toggle-knob {
            transform: translateX(1.55rem);
        }
        
        .icon-sun, .icon-moon {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 14px; height: 14px; pointer-events: none;
            transition: opacity 0.3s;
        }
        .icon-sun { left: 5px; color: #64748b; opacity: 1; }
        .icon-moon { right: 5px; color: #e2e8f0; opacity: 0.5; }
        
        .toggle-checkbox:checked + .toggle-track .icon-sun { opacity: 0.5; color: #a5b4fc; }
        .toggle-checkbox:checked + .toggle-track .icon-moon { opacity: 1; color: white; }

        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.3); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.5); }
        
        #app-loader { position: fixed; inset: 0; z-index: 9999; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: opacity 0.4s; }
        .loader-spinner { width: 32px; height: 32px; border: 2px solid rgba(255,255,255,0.1); border-radius: 50%; border-top-color: #818cf8; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .jvm-tooltip { background-color: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); font-family: 'Inter', sans-serif; border-radius: 4px; padding: 6px 10px; font-size: 12px; z-index: 999; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        
        .rank-1 { color: #fbbf24; text-shadow: 0 0 10px rgba(251, 191, 36, 0.3); }
        .rank-2 { color: #9ca3af; }
        .rank-3 { color: #b45309; }
        .rank-norm { color: #64748b; font-weight: normal; }
        .dark .rank-norm { color: #94a3b8; }

        .ide-window { 
            border-radius: 8px; overflow: hidden; border: 1px solid; 
            transition: all 0.3s ease;
        }
        .dark .ide-window { background: #1e1e2e; border-color: rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        .dark .ide-header { background: #181825; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .dark .ide-content { color: #a6accd; }
        
        .light .ide-window { background: #f8fafc; border-color: #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .light .ide-header { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
        .light .ide-content { color: #334155; }

        .ide-header { padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; }
        .ide-dots { display: flex; gap: 6px; }
        .ide-dot { width: 10px; height: 10px; border-radius: 50%; }
        .ide-content { padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.6; overflow-x: auto; }
        
        .s-tag { color: #ff5572; } .light .s-tag { color: #ef4444; } 
        .s-kw { color: #c792ea; } .light .s-kw { color: #8b5cf6; } 
        .s-str { color: #c3e88d; } .light .s-str { color: #10b981; } 
        .s-hl { color: #ffcb6b; border-bottom: 1px dashed #ffcb6b; font-weight: bold; } .light .s-hl { color: #d97706; border-bottom: 1px dashed #d97706; }
        .s-punc { color: #89ddff; } .light .s-punc { color: #64748b; }
    </style>
</head>
<body class="bg-light-bg dark:bg-dark-bg text-slate-700 dark:text-slate-300 min-h-screen relative selection:bg-indigo-500/30">

    <div id="app-loader"><div class="loader-spinner"></div></div>
    <div class="ambient-light"></div>

    <!-- Login -->
    <div id="login-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-[#0f172a] opacity-0 hidden transition-opacity duration-300">
        <div class="glass-card w-full max-w-sm p-8 mx-4 shadow-2xl relative">
            <div class="text-center mb-8">
                <div class="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mx-auto mb-4 text-2xl">🛡️</div>
                <h2 class="text-lg font-bold text-slate-900 dark:text-white">LEON ANALYTICS</h2>
                <p class="text-xs text-slate-500 mt-1 font-mono tracking-wider">SECURE ACCESS</p>
            </div>
            <form onsubmit="handleLogin(event)" class="space-y-4">
                <input type="password" id="password-input" class="w-full bg-slate-50 dark:bg-slate-900/50 text-center text-sm py-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition font-mono" placeholder="PASSWORD" required autofocus>
                <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-3 rounded-lg shadow-lg transition transform active:scale-[0.98]">UNLOCK</button>
                <p id="login-error" class="text-red-500 text-xs text-center hidden">INVALID TOKEN</p>
            </form>
        </div>
    </div>

    <!-- Dashboard -->
    <div id="dashboard-content" class="max-w-6xl mx-auto px-4 py-6 opacity-0 transition-opacity duration-500">
        
        <!-- Navbar -->
        <header class="flex flex-wrap justify-between items-center mb-6 gap-y-4">
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xl">📊</div>
                <div>
                    <h1 class="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Leon Stats</h1>
                    <div class="flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] animate-pulse"></span>
                        <p class="text-xs text-slate-500 font-medium">System Online</p>
                    </div>
                </div>
            </div>

            <div class="flex items-center gap-1 md:gap-2 bg-white/80 dark:bg-[#1e1e2e]/80 backdrop-blur-xl border border-slate-200/60 dark:border-white/10 shadow-sm rounded-full p-1.5 md:p-2 w-auto justify-end transition-all">
                <div class="hidden md:flex items-center pl-2 pr-3 border-r border-slate-200 dark:border-white/10 mr-1">
                    <span class="text-[10px] text-slate-400 font-bold mr-2 tracking-widest uppercase">SITE</span>
                    <div class="relative">
                        <select id="site-select-desktop" onchange="changeSite(this.value)" class="appearance-none bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none pr-4 cursor-pointer relative z-10">
                            <option value="all">ALL SITES</option>
                        </select>
                        <div class="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div>
                    </div>
                </div>

                <!-- Toggle Switch -->
                <div class="flex items-center px-1">
                    <label for="theme-toggle" class="relative inline-block cursor-pointer group">
                        <input type="checkbox" id="theme-toggle" class="toggle-checkbox hidden" onchange="toggleTheme()">
                        <div class="toggle-track">
                            <svg class="icon-sun" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"></path></svg>
                            <svg class="icon-moon" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clip-rule="evenodd"></path></svg>
                            <div class="toggle-knob"></div>
                        </div>
                    </label>
                </div>

                <div class="w-px h-3 md:h-4 bg-slate-200 dark:bg-white/10 mx-0.5 md:mx-1"></div>

                <button onclick="toggleLang()" class="h-7 md:h-8 px-2 md:px-3 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-[10px] md:text-xs font-bold text-slate-600 dark:text-slate-300 transition-all font-sans" id="lang-btn">EN</button>
                <button onclick="refreshData()" class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 transition-all group" title="Refresh"><svg id="refresh-icon" class="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                <button onclick="logout()" class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all" title="Logout"><svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg></button>
            </div>
            
            <div class="md:hidden w-full order-last mt-1 bg-white/80 dark:bg-[#1e1e2e]/80 backdrop-blur-xl border border-slate-200/60 dark:border-white/10 rounded-lg p-2">
                 <select id="site-select-mobile" onchange="changeSite(this.value)" class="appearance-none w-full bg-transparent text-xs text-center font-bold text-indigo-600 dark:text-indigo-400 font-sans border-none p-0 focus:ring-0 truncate"><option value="all">ALL SITES</option></select>
            </div>
        </header>

        <!-- KPI Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="glass-card p-5">
                <h3 class="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1" data-i18n="totalVisits">TOTAL VISITS</h3>
                <div class="flex items-baseline gap-2">
                    <p class="text-3xl font-bold text-slate-900 dark:text-white font-mono" id="total-pv">0</p>
                    <span class="text-xs text-indigo-500 font-medium">PV</span>
                </div>
            </div>
            <div class="glass-card p-5">
                <h3 class="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1" data-i18n="uniqueVisitors">UNIQUE VISITORS</h3>
                <div class="flex items-baseline gap-2">
                    <p class="text-3xl font-bold text-slate-900 dark:text-white font-mono" id="unique-visitors">0</p>
                    <span class="text-xs text-indigo-500 font-medium">UV</span>
                </div>
            </div>
            <div class="glass-card p-5">
                <h3 class="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1" data-i18n="currentSite">ACTIVE FILTER</h3>
                <div class="mt-1">
                    <span class="inline-block px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-200 dark:border-indigo-500/20" id="current-site-badge">ALL</span>
                </div>
            </div>
        </div>

        <!-- Visuals Row -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <!-- Map -->
            <div class="lg:col-span-2 glass-card p-5 flex flex-col">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center"><span class="mr-2">🌍</span> <span data-i18n="globalMap">Global Live Map</span></h3>
                <div id="world-map" class="w-full flex-grow min-h-[320px] rounded-lg overflow-hidden bg-slate-50 dark:bg-[#181825]/50">
                    <div class="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs opacity-60 animate-pulse">Loading Map...</div>
                </div>
            </div>
            <!-- Top Sites & Chart -->
            <div class="flex flex-col gap-6">
                <!-- Top Sites -->
                <div class="glass-card p-5 flex-1 flex flex-col h-[260px] min-h-[260px]">
                    <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between">
                        <span><span class="mr-2">🔥</span> <span data-i18n="topSites">Top Sites</span></span>
                        <span class="text-[10px] text-slate-400 font-normal">SCROLLABLE</span>
                    </h3>
                    <div class="overflow-y-auto custom-scrollbar flex-1 pr-1">
                        <div id="top-sites-list" class="space-y-2">
                            <div class="text-center text-xs text-slate-400 py-4 font-mono">Loading...</div>
                        </div>
                    </div>
                </div>
                <!-- Chart -->
                <div class="glass-card p-5 flex-1 h-[260px] min-h-[260px] flex flex-col">
                    <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center"><span class="mr-2">📈</span> <span data-i18n="topList">Top Regions</span></h3>
                    <div class="flex-grow w-full relative"><canvas id="countryChart"></canvas></div>
                </div>
            </div>
        </div>

        <!-- Live Data Table -->
        <div class="glass-card overflow-hidden mb-6 flex flex-col">
            <div class="px-5 py-3 border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white" data-i18n="liveData">Live Data Stream</h3>
                <div class="flex items-center gap-2">
                    <span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                    <span class="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-mono tracking-wide" data-i18n="realtime">LIVE</span>
                </div>
            </div>
            <div class="overflow-auto h-[400px] custom-scrollbar relative bg-white dark:bg-[#0f172a]/20">
                <table class="min-w-full text-left border-collapse">
                    <thead class="bg-slate-50 dark:bg-[#1e1e2e] text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th class="px-4 py-3 w-28 whitespace-nowrap" data-i18n="time">Time</th>
                            <th class="px-4 py-3 w-32 whitespace-nowrap" data-i18n="ip">IP Addr</th>
                            <th class="px-4 py-3 w-32 whitespace-nowrap" data-i18n="region">Region</th>
                            <th class="px-4 py-3 w-28 whitespace-nowrap" data-i18n="site">Site</th>
                            <th class="px-4 py-3 whitespace-nowrap" data-i18n="path">Path</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-700 dark:text-slate-300 text-xs" id="visit-list">
                        <tr><td colspan="5" class="px-5 py-8 text-center text-slate-400 font-mono italic">Waiting for signal...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Deploy Section -->
        <div class="glass-card p-6 border-l-4 border-indigo-500">
            <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><span>🚀</span> <span data-i18n="deployTitle">Integration Guide</span></h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div class="text-xs text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
                    <p><span class="font-bold text-indigo-500">Step 1:</span> <span data-i18n="step1">Copy the code snippet on the right.</span></p>
                    <p><span class="font-bold text-indigo-500">Step 2:</span> <span data-i18n="step2">Paste it into your website's HTML file, just before the closing </span> <code class="bg-slate-100 dark:bg-white/10 px-1 rounded">&lt;/body&gt;</code> <span data-i18n="step2b">tag.</span></p>
                    <p><span class="font-bold text-indigo-500">Step 3:</span> <span data-i18n="step3">Change the highlighted </span> <span class="text-amber-600 dark:text-amber-500 font-mono font-bold">'default'</span> <span data-i18n="step3b">to your site's name (e.g. 'my-blog').</span></p>
                </div>

                <div class="ide-window relative group">
                    <div class="ide-header">
                        <div class="ide-dots"><div class="ide-dot bg-[#ff5f56]"></div><div class="ide-dot bg-[#ffbd2e]"></div><div class="ide-dot bg-[#27c93f]"></div></div>
                        <span class="text-[10px] text-slate-400 font-mono">embed.js</span>
                        <button onclick="copyCode()" class="bg-slate-200/50 dark:bg-white/10 hover:bg-slate-300/50 dark:hover:bg-white/20 text-slate-600 dark:text-white text-[10px] font-bold px-2 py-1 rounded transition flex items-center gap-1" title="Copy Clean Code">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg> COPY
                        </button>
                    </div>
                    <div class="ide-content">
                        <div><span class="s-tag">&lt;script&gt;</span></div>
                        <div><span class="s-kw">fetch</span>(<span class="s-str">'\${window.location.origin}/api/track'</span>, <span class="s-punc">{</span></div>
                        <div class="pl-4"><span class="s-kw">method</span>: <span class="s-str">'POST'</span>,</div>
                        <div class="pl-4"><span class="s-kw">headers</span>: <span class="s-punc">{</span> <span class="s-str">'Content-Type'</span>: <span class="s-str">'application/json'</span> <span class="s-punc">}</span>,</div>
                        <div class="pl-4"><span class="s-kw">body</span>: <span class="s-kw">JSON</span>.<span class="s-kw">stringify</span>(<span class="s-punc">{</span></div>
                        <div class="pl-8"><span class="s-kw">site_id</span>: <span class="s-hl">'default'</span>, <span class="s-comment">// 👈 Change ID</span></div>
                        <div class="pl-8"><span class="s-kw">path</span>: <span class="s-kw">window</span>.<span class="s-kw">location</span>.<span class="s-kw">pathname</span></div>
                        <div class="pl-4"><span class="s-punc">}</span>)</div>
                        <div><span class="s-punc">}</span>).<span class="s-kw">catch</span>(<span class="s-kw">e</span> => <span class="s-punc">{}</span>);</div>
                        <div><span class="s-tag">&lt;/script&gt;</span></div>
                    </div>
                </div>
            </div>
        </div>

        <footer class="mt-10 text-center pb-6">
             <p class="text-[10px] text-slate-400 font-mono opacity-60">LEON ANALYTICS v3.8 // SECURE CONNECTION</p>
        </footer>
    </div>

    <!-- Scripts -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsvectormap/1.5.3/js/jsvectormap.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsvectormap/1.5.3/maps/world.js"></script>

    <script>
        function copyCode() {
            // Clean Code with Tags
            const origin = window.location.origin;
            const cleanCode = \`<script>
fetch('\${origin}/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site_id: 'default',
    path: window.location.pathname
  })
}).catch(e => {});
<\\/script>\`;
            navigator.clipboard.writeText(cleanCode).then(() => alert(curLang === 'en' ? 'Clean code copied!' : '纯净代码已复制！'));
        }

        window.addEventListener('DOMContentLoaded', () => {
            const loader = document.getElementById('app-loader');
            if(loader) {
                setTimeout(() => {
                    loader.style.opacity = '0';
                    setTimeout(() => loader.style.display = 'none', 400);
                }, 600);
            }
        });

        const i18n = {
            en: {
                systemName: "Access Control System",
                loginBtn: "UNLOCK DASHBOARD",
                loginError: "INVALID PASSCODE",
                totalVisits: "TOTAL VISITS",
                topSource: "TOP SOURCE",
                uniqueVisitors: "UNIQUE VISITORS",
                currentSite: "ACTIVE FILTER",
                globalMap: "Live Traffic Map",
                topList: "Top Regions",
                topSites: "Top Sites",
                deployTitle: "Integration Guide",
                deployCode: "Deploy Code",
                deployDesc: "Follow the steps below to integrate tracking.",
                step1: "Click the COPY button.",
                step2: "Paste before the closing",
                step2b: "tag.",
                step3: "Change",
                step3b: "to your project name.",
                liveData: "Data Stream",
                realtime: "LIVE",
                time: "Time",
                ip: "IP Address",
                site: "Site",
                region: "Region",
                path: "Path",
                waitingData: "Awaiting incoming signal...",
                noData: "No data captured yet.",
                allSites: "ALL SITES"
            },
            zh: {
                systemName: "安全访问控制系统",
                loginBtn: "解锁控制台",
                loginError: "密码错误",
                totalVisits: "总访问量",
                topSource: "主要来源",
                uniqueVisitors: "独立访客",
                currentSite: "当前筛选",
                globalMap: "全球实时地图",
                topList: "地区排行",
                topSites: "热门网站",
                deployTitle: "集成指南",
                deployCode: "部署代码",
                deployDesc: "按照以下步骤完成部署。",
                step1: "点击右上角的 COPY 按钮。",
                step2: "粘贴到网页底部的",
                step2b: "标签之前。",
                step3: "将高亮的",
                step3b: "改为你的项目名称。",
                liveData: "实时数据流",
                realtime: "实时",
                time: "时间",
                ip: "IP 地址",
                site: "站点",
                region: "地区",
                path: "路径",
                waitingData: "等待信号接入...",
                noData: "暂无数据记录。",
                allSites: "所有站点"
            }
        };

        let curLang = localStorage.getItem('tj_lang') || 'en';
        let curTheme = localStorage.getItem('tj_theme') || 'dark';
        let currentSiteId = 'all';
        let autoRefreshTimer = null;

        function initSystem() {
            document.documentElement.className = curTheme;
            updateLanguageUI();
            updateSiteSelectUI();
            
            const toggle = document.getElementById('theme-toggle');
            if(toggle) toggle.checked = (curTheme === 'dark');

            const savedToken = localStorage.getItem('tj_auth_token');
            if (savedToken) {
                unlockDashboard();
                loadData(savedToken);
                startAutoRefresh();
            } else {
                const modal = document.getElementById('login-modal');
                modal.classList.remove('hidden');
                setTimeout(() => modal.classList.remove('opacity-0'), 100);
            }
        }

        function startAutoRefresh() {
            if (autoRefreshTimer) clearInterval(autoRefreshTimer);
            autoRefreshTimer = setInterval(() => {
                const token = localStorage.getItem('tj_auth_token');
                if (token) loadData(token, true);
            }, 5000);
        }

        function toggleTheme() {
            curTheme = curTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.className = curTheme;
            localStorage.setItem('tj_theme', curTheme);
            if (lastChartData) {
                renderChart(lastChartData);
                try { renderMap(lastChartData); } catch(e) {}
            }
        }

        function toggleLang() {
            curLang = curLang === 'en' ? 'zh' : 'en';
            localStorage.setItem('tj_lang', curLang);
            updateLanguageUI();
            updateSiteSelectUI();
        }

        function updateLanguageUI() {
            document.getElementById('lang-btn').innerText = curLang === 'en' ? 'EN' : 'CN';
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (i18n[curLang][key]) el.innerText = i18n[curLang][key];
            });
            document.querySelectorAll('[data-placeholder]').forEach(el => {
                const key = el.getAttribute('data-placeholder');
                if (i18n[curLang][key]) el.placeholder = i18n[curLang][key];
            });
        }

        function handleLogin(e) {
            e.preventDefault();
            loadData(document.getElementById('password-input').value);
        }

        function unlockDashboard() {
            const modal = document.getElementById('login-modal');
            const content = document.getElementById('dashboard-content');
            modal.style.opacity = '0';
            setTimeout(() => modal.style.display = 'none', 300);
            content.classList.remove('opacity-0');
            window.dispatchEvent(new Event('resize'));
            startAutoRefresh();
        }

        function logout() { 
            localStorage.removeItem('tj_auth_token'); 
            clearInterval(autoRefreshTimer);
            location.reload(); 
        }
        
        function refreshData() { loadData(localStorage.getItem('tj_auth_token')); }

        function changeSite(siteId) {
            currentSiteId = siteId;
            document.getElementById('site-select-desktop').value = siteId;
            document.getElementById('site-select-mobile').value = siteId;
            document.getElementById('current-site-badge').innerText = siteId === 'all' ? (curLang === 'en' ? 'ALL' : '全部') : siteId;
            loadData(localStorage.getItem('tj_auth_token'));
        }

        let lastChartData = null;

        async function loadData(token, silent = false) {
            if (!token) return;

            const btnIcon = document.getElementById('refresh-icon');
            if (!silent) btnIcon.classList.add('animate-spin');

            try {
                const url = \`/api/stats?site_id=\${currentSiteId}\`;
                const res = await fetch(url, { headers: { 'Authorization': token } });
                if (res.status === 401) throw new Error("PASSCODE INVALID");
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                localStorage.setItem('tj_auth_token', token);
                document.getElementById('login-error').classList.add('hidden');
                if (document.getElementById('login-modal').style.display !== 'none') unlockDashboard();

                const pvEl = document.getElementById('total-pv');
                const oldVal = parseInt(pvEl.innerText);
                if (data.total !== oldVal) animateValue("total-pv", oldVal, data.total, 800);
                
                const uvEl = document.getElementById('unique-visitors');
                const oldUvVal = parseInt(uvEl.innerText);
                if (data.unique !== oldUvVal) animateValue("unique-visitors", oldUvVal, data.unique, 800);

                // Render Top Sites
                const topSitesEl = document.getElementById('top-sites-list');
                if (data.topSites && data.topSites.length > 0) {
                    topSitesEl.innerHTML = data.topSites.map((s, i) => \`
                        <div class="flex items-center justify-between p-2 rounded bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div class="flex items-center gap-3 min-w-0">
                                <span class="font-bold font-mono text-xs \${i===0?'rank-1':(i===1?'rank-2':(i===2?'rank-3':'rank-norm'))}">#\${i+1}</span>
                                <span class="font-medium text-xs text-slate-700 dark:text-slate-200 truncate">\${s.site_id}</span>
                            </div>
                            <span class="text-xs font-mono text-indigo-500 font-bold">\${s.count}</span>
                        </div>
                    \`).join('');
                } else {
                    topSitesEl.innerHTML = '<div class="text-center text-xs text-slate-400 py-2">No Data</div>';
                }

                updateSiteOptions(data.sites);

                const tbody = document.getElementById('visit-list');
                if (data.recent.length === 0) {
                    tbody.innerHTML = \`<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400 font-mono text-xs">\${i18n[curLang].noData}</td></tr>\`;
                } else {
                    tbody.innerHTML = data.recent.map(row => \`
                        <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-b border-slate-50 dark:border-white/5 last:border-0 group">
                            <td class="px-4 py-2 text-slate-500 dark:text-slate-400 font-mono text-[12px] whitespace-nowrap">
                                \${new Date(row.timestamp.endsWith('Z') ? row.timestamp : row.timestamp + 'Z').toLocaleTimeString()}
                            </td>
                            <td class="px-4 py-2 font-mono text-[12px] text-indigo-500 dark:text-indigo-400 whitespace-nowrap">\${row.ip}</td>
                            <td class="px-4 py-2 text-[12px] text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap flex items-center gap-2">
                                <span class="text-sm">\${getFlagEmoji(row.country)}</span> \${row.country}
                            </td>
                            <td class="px-4 py-2 whitespace-nowrap">
                                <span class="font-bold text-[12px] text-slate-700 dark:text-slate-200">
                                    \${row.site_id || 'default'}
                                </span>
                            </td>
                            <td class="px-4 py-2 text-slate-500 dark:text-slate-400 text-[12px] truncate max-w-[150px]" title="\${row.path}">
                                \${row.path}
                            </td>
                        </tr>
                    \`).join('');
                }

                lastChartData = data.countries;
                if(!silent) renderChart(data.countries);
                
                try {
                    if (!silent) {
                        if (window.jsVectorMap) renderMap(data.countries);
                        else setTimeout(() => { if (window.jsVectorMap) renderMap(data.countries); }, 1000);
                    }
                } catch (mapErr) {}

            } catch (err) {
                if (err.message === "PASSCODE INVALID") {
                    document.getElementById('login-error').classList.remove('hidden');
                    localStorage.removeItem('tj_auth_token');
                    clearInterval(autoRefreshTimer);
                }
            } finally {
                if (!silent) btnIcon.classList.remove('animate-spin');
            }
        }

        // 修复: 这里的逻辑已更新，同时处理桌面端和移动端下拉菜单
        function updateSiteOptions(sites) {
            // 定义需要更新的两个下拉框ID
            const selectorIds = ['site-select-desktop', 'site-select-mobile'];
            
            selectorIds.forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;

                // 简单的优化：如果选项数量没变，就不重绘（假设站点列表不频繁变动）
                // 注意：这里用 length - 1 是因为默认有一个 'all' 选项
                if (select.options.length - 1 !== sites.length) {
                    const currentVal = currentSiteId; // 使用全局变量 currentSiteId 保持状态
                    select.innerHTML = ''; 
                    
                    const allOpt = document.createElement('option');
                    allOpt.value = 'all';
                    allOpt.innerText = curLang === 'en' ? 'ALL SITES' : '所有站点';
                    select.appendChild(allOpt);
                    
                    sites.forEach(site => {
                        if(!site) return;
                        const opt = document.createElement('option');
                        opt.value = site;
                        opt.innerText = site;
                        select.appendChild(opt);
                    });
                    
                    // 恢复选中状态
                    if (currentVal === 'all' || sites.includes(currentVal)) {
                        select.value = currentVal;
                    } else {
                        select.value = 'all';
                    }
                }
            });
        }
        
        function updateSiteSelectUI() {
             // 同时更新两个下拉框的语言文本
             const ids = ['site-select-desktop', 'site-select-mobile'];
             ids.forEach(id => {
                 const sel = document.getElementById(id);
                 if(sel && sel.options.length > 0) {
                     sel.options[0].text = curLang === 'en' ? 'ALL SITES' : '所有站点';
                 }
             });
             
             if(currentSiteId === 'all') document.getElementById('current-site-badge').innerText = curLang === 'en' ? 'ALL' : '全部';
        }

        function animateValue(id, start, end, duration) {
            if (start === end) return;
            const range = end - start;
            let current = start;
            const increment = end > start ? 1 : -1;
            const stepTime = Math.abs(Math.floor(duration / range));
            const obj = document.getElementById(id);
            const timer = setInterval(function() {
                current += increment;
                obj.innerText = current;
                if (current == end) clearInterval(timer);
            }, Math.max(stepTime, 20));
        }

        function getFlagEmoji(countryCode) {
            if (!countryCode || countryCode === 'Unknown') return '🌐';
            return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
        }

        let chartInstance = null;
        function renderChart(countries) {
            const ctx = document.getElementById('countryChart').getContext('2d');
            const isDark = curTheme === 'dark';
            
            Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
            Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

            if (chartInstance) chartInstance.destroy();
            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: countries.slice(0, 5).map(c => c.country),
                    datasets: [{
                        label: 'Visits',
                        data: countries.slice(0, 5).map(c => c.count),
                        backgroundColor: isDark ? '#818cf8' : '#6366f1',
                        borderRadius: 3,
                        barThickness: 'flex',
                        maxBarThickness: 24
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } }, y: { grid: { display: false } } }
                }
            });
        }

        let mapInstance = null;
        function renderMap(countries) {
            const mapData = {};
            countries.forEach(c => {
                if(c.country && c.country !== 'Unknown') mapData[c.country.toUpperCase()] = c.count;
            });

            document.getElementById('world-map').innerHTML = ''; 

            const isDark = curTheme === 'dark';
            const bgColor = 'transparent';
            const regionFill = isDark ? '#334155' : '#e2e8f0'; 
            const hoverFill = isDark ? '#6366f1' : '#4f46e5';
            
            mapInstance = new jsVectorMap({
                selector: "#world-map",
                map: "world",
                backgroundColor: bgColor,
                zoomButtons: false,
                zoomOnScroll: false,
                regionStyle: {
                    initial: { fill: regionFill, stroke: "none", strokeWidth: 0 },
                    hover: { fill: hoverFill, cursor: 'pointer' },
                    selected: { fill: hoverFill }
                },
                visualizeData: {
                    scale: isDark ? ['#4f46e5', '#a855f7'] : ['#93c5fd', '#2563eb'],
                    values: mapData
                },
                onRegionTooltipShow(event, tooltip, code) {
                    const count = mapData[code] || 0;
                    tooltip.text(\`\${tooltip.text()} (\${count} visits)\`, true);
                }
            });
        }

        initSystem();

    </script>
</body>
</html>
`;