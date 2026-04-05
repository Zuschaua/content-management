ALTER TABLE "articles" ADD COLUMN "seo_score" integer;
CREATE INDEX "articles_client_seo_score" ON "articles" USING btree ("client_id","seo_score");
