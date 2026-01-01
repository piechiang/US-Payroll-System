# 生产环境部署指南 (Production Deployment Guide)

**版本**: 2.0 - Enterprise Features
**最后更新**: 2026-01-01

---

## 📋 部署前检查清单

### 1. 环境准备

#### 必需的环境变量

在生产服务器上设置以下环境变量：

```bash
# 数据库连接 (PostgreSQL)
DATABASE_URL="postgresql://username:password@host:5432/database_name"

# 加密密钥 (32字节十六进制字符串)
ENCRYPTION_KEY="your-32-byte-hex-encryption-key-here"

# JWT 密钥
JWT_SECRET="your-secure-jwt-secret-key"

# 生产环境设置
NODE_ENV="production"
PORT=3001

# 安全设置
REQUIRE_AUTH=true
DISABLE_CSRF=false
DISABLE_RATE_LIMIT=false

# CORS 设置
CORS_ORIGIN="https://your-frontend-domain.com"

# Redis (如使用 BullMQ)
REDIS_URL="redis://localhost:6379"
```

#### 生成加密密钥

```bash
# 使用 Node.js 生成安全的加密密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. 依赖安装

检查 `package.json` 中的所有依赖：

```bash
cd server
npm ci --production
```

**关键依赖验证**:
- ✅ `decimal.js` - 精确计算
- ✅ `date-fns` - 日期处理
- ✅ `csv-stringify` - CSV 导出
- ✅ `@prisma/client` - 数据库 ORM
- ✅ `pdfkit` - W-2 PDF 生成

---

## 🗄️ 数据库迁移

### 步骤 1: 备份现有数据库

```bash
# PostgreSQL 备份
pg_dump -h localhost -U username -d database_name > backup_$(date +%Y%m%d_%H%M%S).sql

# 或使用 Prisma
npx prisma db pull
```

### 步骤 2: 执行迁移

#### Linux/Mac:

```bash
# 赋予执行权限
chmod +x migrate-enterprise-features.sh

# 执行迁移
NODE_ENV=production ./migrate-enterprise-features.sh
```

#### Windows:

```bash
# 设置环境变量
set NODE_ENV=production

# 执行迁移
migrate-enterprise-features.bat
```

#### 手动迁移（如果脚本失败）:

```bash
# 1. 生成 Prisma Client
npx prisma generate

# 2. 应用迁移
npx prisma migrate deploy

# 3. 验证状态
npx prisma migrate status
```

### 步骤 3: 验证迁移

```bash
# 检查表是否创建成功
psql -h localhost -U username -d database_name -c "\dt"

# 验证 audit_logs 表
psql -h localhost -U username -d database_name -c "\d audit_logs"

# 验证索引
psql -h localhost -U username -d database_name -c "\di"
```

---

## 🧪 部署前测试

### 1. 运行测试套件

```bash
cd server

# 运行所有测试
npm test

# 运行特定测试
npm test -- prorationCalculator
npm test -- garnishmentCalculator

# 查看覆盖率
npm test -- --coverage
```

### 2. 手动 API 测试

```bash
# 健康检查
curl https://your-api-domain.com/api/health

# 成本趋势
curl -H "Authorization: Bearer $TOKEN" \
  "https://your-api-domain.com/api/metrics/cost-trend?companyId=123"

# GL 导出
curl -H "Authorization: Bearer $TOKEN" \
  "https://your-api-domain.com/api/gl-export/quickbooks-csv?companyId=123&payPeriodStart=2024-01-01&payPeriodEnd=2024-01-15" \
  --output payroll.csv
```

---

## 🚀 部署流程

### 选项 1: Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --production

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 启动应用
CMD ["node", "dist/index.js"]
```

构建和运行:

```bash
# 构建镜像
docker build -t us-payroll-api:2.0 .

# 运行容器
docker run -d \
  --name payroll-api \
  -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e ENCRYPTION_KEY="..." \
  -e NODE_ENV=production \
  us-payroll-api:2.0

# 查看日志
docker logs -f payroll-api
```

### 选项 2: PM2 部署

安装 PM2:

```bash
npm install -g pm2
```

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'us-payroll-api',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

启动应用:

```bash
# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs us-payroll-api

# 重启
pm2 restart us-payroll-api

# 设置开机自启
pm2 startup
pm2 save
```

### 选项 3: Systemd 服务

创建 `/etc/systemd/system/payroll-api.service`:

```ini
[Unit]
Description=US Payroll System API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/payroll-api
Environment=NODE_ENV=production
Environment=PORT=3001
EnvironmentFile=/var/www/payroll-api/.env
ExecStart=/usr/bin/node /var/www/payroll-api/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=payroll-api

[Install]
WantedBy=multi-user.target
```

管理服务:

```bash
# 重新加载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start payroll-api

# 设置开机自启
sudo systemctl enable payroll-api

# 查看状态
sudo systemctl status payroll-api

# 查看日志
sudo journalctl -u payroll-api -f
```

---

## 🔒 安全配置

### 1. Nginx 反向代理

创建 `/etc/nginx/sites-available/payroll-api`:

```nginx
upstream payroll_api {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/payroll-api.access.log;
    error_log /var/log/nginx/payroll-api.error.log;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req zone=api_limit burst=20 nodelay;

    # Proxy settings
    location / {
        proxy_pass http://payroll_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # Health check endpoint (no rate limit)
    location /api/health {
        proxy_pass http://payroll_api;
        access_log off;
    }
}
```

启用配置:

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/payroll-api /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重新加载
sudo systemctl reload nginx
```

### 2. 防火墙配置

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 检查状态
sudo ufw status
```

---

## 📊 监控和日志

### 1. 日志配置

使用 Winston 或 Pino 进行结构化日志:

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### 2. Prometheus 监控

Metrics 端点已配置在 `/api/prometheus-metrics`

Prometheus 配置 (`prometheus.yml`):

```yaml
scrape_configs:
  - job_name: 'payroll-api'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/prometheus-metrics'
    scrape_interval: 15s
```

### 3. 数据库监控

```sql
-- 慢查询日志
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- 查看连接数
SELECT count(*) FROM pg_stat_activity;

-- 查看表大小
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 🔄 滚动更新 (Zero-Downtime Deployment)

### 使用 PM2:

```bash
# 步骤 1: 拉取最新代码
git pull origin main

# 步骤 2: 安装依赖
npm ci --production

# 步骤 3: 构建
npm run build

# 步骤 4: 运行迁移
npx prisma migrate deploy

# 步骤 5: 无缝重启
pm2 reload ecosystem.config.js --update-env
```

### 使用 Docker:

```bash
# 步骤 1: 构建新镜像
docker build -t us-payroll-api:2.1 .

# 步骤 2: 运行迁移
docker run --rm \
  -e DATABASE_URL="..." \
  us-payroll-api:2.1 \
  npx prisma migrate deploy

# 步骤 3: 滚动更新
docker service update \
  --image us-payroll-api:2.1 \
  --update-parallelism 1 \
  --update-delay 10s \
  payroll-api-service
```

---

## ✅ 部署后验证

### 1. 健康检查

```bash
# API 健康
curl https://api.yourdomain.com/api/health

# 预期响应:
{
  "status": "ok",
  "version": "v1",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "connected",
    "latency": 15
  }
}
```

### 2. 功能测试

测试新功能端点:

```bash
# Metrics API
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.yourdomain.com/api/metrics/cost-trend?companyId=test"

# GL Export
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.yourdomain.com/api/gl-export/formats"

# 审计日志 (需管理员权限)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.yourdomain.com/api/audit-logs?companyId=test&limit=10"
```

### 3. 性能验证

```bash
# 使用 Apache Bench
ab -n 1000 -c 10 https://api.yourdomain.com/api/health

# 查看响应时间
Requests per second: > 500
Time per request: < 20ms
```

---

## 🚨 故障排查

### 常见问题

#### 1. 数据库连接失败

```bash
# 检查 DATABASE_URL
echo $DATABASE_URL

# 测试连接
psql $DATABASE_URL

# 检查 Prisma 配置
npx prisma db pull
```

#### 2. 迁移失败

```bash
# 查看迁移状态
npx prisma migrate status

# 标记迁移为已应用（谨慎使用）
npx prisma migrate resolve --applied <migration_name>

# 重置数据库（开发环境）
npx prisma migrate reset
```

#### 3. 内存泄漏

```bash
# 使用 PM2 监控
pm2 monit

# 生成堆快照
node --inspect dist/index.js
```

---

## 📞 支持和维护

### 定期维护任务

#### 每日
- ✅ 检查错误日志
- ✅ 监控 API 响应时间
- ✅ 验证备份完成

#### 每周
- ✅ 审查审计日志
- ✅ 检查数据库性能
- ✅ 更新依赖包

#### 每月
- ✅ 安全补丁更新
- ✅ 数据库索引优化
- ✅ 清理旧日志

### 紧急联系

- **API 问题**: 检查 `/api/health` 和日志
- **数据库问题**: 检查连接池和慢查询
- **性能问题**: 查看 Prometheus 指标

---

## 📝 变更日志

### Version 2.0 (2026-01-01)
- ✅ 添加 AuditLog 模型
- ✅ ProrationCalculator 服务
- ✅ GarnishmentCalculator 服务
- ✅ Metrics API (5个端点)
- ✅ GL Export API (CSV + IIF)
- ✅ 21个测试用例

### Version 1.0
- ✅ 基础薪资计算
- ✅ W-2 表单生成
- ✅ 多租户支持

---

**部署完成！** 🎉

如有问题，请参考：
- [PHASE_1_2_COMPLETION_SUMMARY.md](PHASE_1_2_COMPLETION_SUMMARY.md)
- [ENTERPRISE_FEATURES_ROADMAP.md](ENTERPRISE_FEATURES_ROADMAP.md)
