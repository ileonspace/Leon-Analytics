DROP TABLE IF EXISTS visits;

-- 创建访问记录表
CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT DEFAULT 'default',      -- 站点ID (用于多站点统计)
    ip TEXT,                             -- 访客IP
    country TEXT,                        -- 访客国家/地区代码
    path TEXT,                           -- 访问路径
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP -- 访问时间
);

-- 创建索引以优化查询速度
CREATE INDEX IF NOT EXISTS idx_site_id ON visits(site_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON visits(timestamp);
CREATE INDEX IF NOT EXISTS idx_country ON visits(country);