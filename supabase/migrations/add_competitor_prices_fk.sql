-- Migration: Add foreign key constraint to competitor_prices table
-- This enables Supabase to recognize the relationship between competitor_prices and products

ALTER TABLE competitor_prices
ADD CONSTRAINT competitor_prices_product_id_fk 
FOREIGN KEY (product_id) 
REFERENCES products(id) 
ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_competitor_prices_product_id 
ON competitor_prices(product_id);
