// Veritabanı şeması. Yeni bir değişiklik gerekirse ALTINA yeni bir migration eklenir;
// eskileri asla değiştirilmez (canlıdaki veritabanı sırayla günceller).
// Zamanlar milisaniye (BIGINT), randevu tarih/saatleri Türkiye saatiyle metin ("2026-11-11", "09:30").

export const MIGRATIONS = [
  {
    version: 1,
    name: 'ilk kurulum',
    up: [
      `CREATE TABLE users (
        id VARCHAR(40) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(190) NOT NULL,
        pass_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) NOT NULL,
        must_change TINYINT NOT NULL DEFAULT 0,
        active TINYINT NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        deleted_at BIGINT NULL
      )`,
      'CREATE INDEX idx_users_email ON users (email)',

      `CREATE TABLE sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id VARCHAR(40) NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL
      )`,
      'CREATE INDEX idx_sessions_user ON sessions (user_id)',

      `CREATE TABLE reset_tokens (
        token_hash CHAR(64) PRIMARY KEY,
        user_id VARCHAR(40) NOT NULL,
        created_at BIGINT NOT NULL
      )`,

      `CREATE TABLE forms (
        id VARCHAR(40) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        isletme VARCHAR(200) NOT NULL DEFAULT '',
        slug VARCHAR(80) NOT NULL,
        control TEXT NOT NULL,
        draft LONGTEXT NOT NULL,
        published LONGTEXT NULL,
        published_at BIGINT NULL,
        created_by VARCHAR(40) NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        deleted_at BIGINT NULL
      )`,
      'CREATE INDEX idx_forms_slug ON forms (slug)',

      `CREATE TABLE form_versions (
        id VARCHAR(40) PRIMARY KEY,
        form_id VARCHAR(40) NOT NULL,
        snapshot LONGTEXT NOT NULL,
        by_user VARCHAR(40) NULL,
        by_name VARCHAR(150) NOT NULL DEFAULT '',
        note VARCHAR(500) NOT NULL DEFAULT '',
        at BIGINT NOT NULL
      )`,
      'CREATE INDEX idx_versions_form ON form_versions (form_id, at)',

      `CREATE TABLE permissions (
        user_id VARCHAR(40) NOT NULL,
        form_id VARCHAR(40) NOT NULL,
        perms TEXT NOT NULL,
        PRIMARY KEY (user_id, form_id)
      )`,

      `CREATE TABLE submissions (
        id VARCHAR(40) PRIMARY KEY,
        form_id VARCHAR(40) NOT NULL,
        vals LONGTEXT NOT NULL,
        labels TEXT NOT NULL,
        types TEXT NOT NULL,
        ord TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'yeni',
        notes LONGTEXT NOT NULL,
        appointment_id VARCHAR(40) NULL,
        manual TINYINT NOT NULL DEFAULT 0,
        kvkk_at BIGINT NULL,
        ip VARCHAR(64) NOT NULL DEFAULT '',
        user_agent VARCHAR(255) NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        deleted_at BIGINT NULL
      )`,
      'CREATE INDEX idx_subs_form ON submissions (form_id, created_at)',

      `CREATE TABLE files (
        id VARCHAR(40) PRIMARY KEY,
        form_id VARCHAR(40) NOT NULL,
        submission_id VARCHAR(40) NOT NULL,
        name VARCHAR(200) NOT NULL,
        mime VARCHAR(120) NOT NULL,
        size BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      'CREATE INDEX idx_files_sub ON files (submission_id)',

      `CREATE TABLE appointments (
        id VARCHAR(40) PRIMARY KEY,
        form_id VARCHAR(40) NOT NULL,
        submission_id VARCHAR(40) NOT NULL,
        service_id VARCHAR(60) NOT NULL,
        resource_id VARCHAR(60) NULL,
        date CHAR(10) NOT NULL,
        start CHAR(5) NOT NULL,
        end_time CHAR(5) NOT NULL,
        buffer INT NOT NULL DEFAULT 0,
        party_size INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL,
        cancel_token CHAR(32) NOT NULL,
        cancelled_by VARCHAR(20) NULL,
        reminder_sent TINYINT NOT NULL DEFAULT 0,
        contact TEXT NOT NULL,
        lang VARCHAR(5) NOT NULL DEFAULT 'tr',
        source VARCHAR(20) NOT NULL DEFAULT 'form',
        created_at BIGINT NOT NULL
      )`,
      'CREATE INDEX idx_appts_form_date ON appointments (form_id, date)',
      'CREATE INDEX idx_appts_token ON appointments (cancel_token)',
      'CREATE INDEX idx_appts_reminder ON appointments (status, reminder_sent, date)',

      `CREATE TABLE blocks (
        id VARCHAR(40) PRIMARY KEY,
        form_id VARCHAR(40) NOT NULL,
        date CHAR(10) NOT NULL,
        start CHAR(5) NOT NULL,
        end_time CHAR(5) NOT NULL,
        resource_id VARCHAR(60) NULL,
        note VARCHAR(300) NOT NULL DEFAULT ''
      )`,
      'CREATE INDEX idx_blocks_form_date ON blocks (form_id, date)',

      `CREATE TABLE logs (
        id VARCHAR(40) PRIMARY KEY,
        user_id VARCHAR(40) NULL,
        action VARCHAR(300) NOT NULL,
        target VARCHAR(300) NOT NULL DEFAULT '',
        at BIGINT NOT NULL
      )`,
      'CREATE INDEX idx_logs_at ON logs (at)',

      `CREATE TABLE outbox (
        id VARCHAR(40) PRIMARY KEY,
        recipient VARCHAR(190) NOT NULL,
        subject VARCHAR(300) NOT NULL,
        body TEXT NOT NULL,
        kind VARCHAR(30) NOT NULL,
        channel VARCHAR(10) NOT NULL DEFAULT 'mail',
        status VARCHAR(20) NOT NULL DEFAULT 'bekliyor',
        attempts INT NOT NULL DEFAULT 0,
        error VARCHAR(500) NULL,
        at BIGINT NOT NULL,
        sent_at BIGINT NULL
      )`,
      'CREATE INDEX idx_outbox_status ON outbox (status, at)'
    ]
  },
  {
    version: 2,
    name: 'oturum süresi, bildirimler, iki adımlı doğrulama',
    up: [
      // 2 saat işlem yapılmazsa oturum kapanır: son hareket zamanı
      'ALTER TABLE sessions ADD COLUMN last_seen BIGINT NULL',
      // Kullanıcının kendi açıp kapattığı bildirim anahtarı ve "okundu" zamanı
      'ALTER TABLE users ADD COLUMN notify_enabled TINYINT NOT NULL DEFAULT 1',
      'ALTER TABLE users ADD COLUMN notif_seen_at BIGINT NULL',
      // Authenticator (TOTP)
      'ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64) NULL',
      'ALTER TABLE users ADD COLUMN totp_enabled TINYINT NOT NULL DEFAULT 0',
      'ALTER TABLE users ADD COLUMN totp_last_step BIGINT NULL',
      'ALTER TABLE users ADD COLUMN backup_codes TEXT NULL',

      // Telefon / tarayıcı bildirim abonelikleri (cihaz başına bir satır)
      `CREATE TABLE push_subscriptions (
        id VARCHAR(40) PRIMARY KEY,
        user_id VARCHAR(40) NOT NULL,
        endpoint_hash CHAR(64) NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(200) NOT NULL,
        auth VARCHAR(100) NOT NULL,
        label VARCHAR(150) NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        last_ok_at BIGINT NULL,
        fail_count INT NOT NULL DEFAULT 0
      )`,
      'CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint_hash)',
      'CREATE INDEX idx_push_user ON push_subscriptions (user_id)',

      // Panel içi bildirim akışı. Kişisel veri YOK: sadece tarih/saat/hizmet ve form adı.
      `CREATE TABLE notifications (
        id VARCHAR(40) PRIMARY KEY,
        form_id VARCHAR(40) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body VARCHAR(500) NOT NULL,
        url VARCHAR(300) NOT NULL,
        push_done TINYINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
      )`,
      'CREATE INDEX idx_notif_form_at ON notifications (form_id, created_at)',
      'CREATE INDEX idx_notif_push ON notifications (push_done, created_at)',

      // Uygulama ayarları (bildirim anahtarları gibi)
      `CREATE TABLE app_settings (
        k VARCHAR(60) PRIMARY KEY,
        v TEXT NOT NULL
      )`
    ]
  },
  {
    version: 3,
    name: 'açık rıza onayı',
    up: ['ALTER TABLE submissions ADD COLUMN consent_at BIGINT NULL']
  }
];
