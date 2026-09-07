-- Exact canonical lookup and alias learning must remain idempotent during retries.
ALTER TABLE "facts"
ADD COLUMN "subject_type" "EntityType" NOT NULL DEFAULT 'OTHER';

CREATE UNIQUE INDEX "entities_normalized_name_entity_type_key"
ON "entities"("normalized_name", "entity_type");

CREATE UNIQUE INDEX "entity_aliases_entity_id_normalized_alias_key"
ON "entity_aliases"("entity_id", "normalized_alias");
