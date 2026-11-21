-- Constraint tambahan & sequence (SRS Bagian 3.3)
-- Jalankan setelah migrasi awal tabel atau tambahkan ke file migration SQL.

ALTER TABLE products ADD CONSTRAINT chk_stock_nonneg CHECK (stock_quantity >= 0);
ALTER TABLE products ADD CONSTRAINT chk_price_nonneg CHECK (purchase_price >= 0 AND selling_price >= 0 AND minimum_stock >= 0);
ALTER TABLE transaction_items ADD CONSTRAINT chk_qty_pos CHECK (quantity > 0);
ALTER TABLE transactions ADD CONSTRAINT chk_discount CHECK (discount >= 0 AND discount <= subtotal);

CREATE SEQUENCE IF NOT EXISTS transaction_number_seq;

-- Keamanan Supabase: aktifkan RLS tanpa policy agar API publik Supabase tidak bisa mengakses data (SRS Bagian 3.4).
-- Prisma tetap dapat mengakses karena memakai role postgres dari connection string.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

