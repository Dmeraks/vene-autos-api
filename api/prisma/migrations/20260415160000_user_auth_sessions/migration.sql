-- CreateTable
CREATE TABLE "user_auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_from_ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "user_auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_auth_sessions_user_id_revoked_at_idx" ON "user_auth_sessions"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "user_auth_sessions" ADD CONSTRAINT "user_auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
