-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "kind" TEXT;
ALTER TABLE "Ingredient" ADD COLUMN "packPrice" INTEGER;
ALTER TABLE "Ingredient" ADD COLUMN "packSize" REAL;

-- CreateTable
CREATE TABLE "BatchTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "outputIngredientId" TEXT NOT NULL,
    "outputQuantity" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchTemplate_outputIngredientId_fkey" FOREIGN KEY ("outputIngredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BatchComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    CONSTRAINT "BatchComponent_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BatchTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BatchComponent_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductTopping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "extraPrice" INTEGER NOT NULL,
    CONSTRAINT "ProductTopping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductTopping_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleItemTopping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleItemId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "ingredientName" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "extraPrice" INTEGER NOT NULL,
    CONSTRAINT "SaleItemTopping_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleItemTopping_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BatchComponent_templateId_ingredientId_key" ON "BatchComponent"("templateId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTopping_productId_ingredientId_key" ON "ProductTopping"("productId", "ingredientId");
