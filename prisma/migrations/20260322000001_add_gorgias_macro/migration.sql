-- CreateTable
CREATE TABLE "gorgias_macros" (
    "id" TEXT NOT NULL,
    "gorgias_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "category" TEXT,
    "language" TEXT,
    "tags" TEXT[],
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gorgias_macros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gorgias_macros_gorgias_id_key" ON "gorgias_macros"("gorgias_id");

-- CreateIndex
CREATE INDEX "gorgias_macros_name_idx" ON "gorgias_macros"("name");
