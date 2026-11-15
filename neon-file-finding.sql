-- Add FILE_FINDING (فایل‌یابی) to CustomerSource enum
-- Run in Neon console SQL editor (project saj-crm, branch production).
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block;
-- run it as a single statement in the editor.
ALTER TYPE "CustomerSource" ADD VALUE 'FILE_FINDING';
