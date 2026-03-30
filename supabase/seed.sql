-- Seed data for local development.
-- Creates a test household. Test user is created via Auth API (see e2e test script).

INSERT INTO households (name) VALUES ('Rasche Household');
INSERT INTO people (name, role, household_id) VALUES ('Jim', 'adult', 1);
INSERT INTO people (name, role, household_id) VALUES ('Justine', 'adult', 1);
INSERT INTO people (name, role, household_id) VALUES ('Charlie', 'child', 1);
INSERT INTO people (name, role, household_id) VALUES ('Theo', 'child', 1);
INSERT INTO locations (name, household_id) VALUES ('Kitchen', 1);
INSERT INTO locations (name, household_id) VALUES ('Garage', 1);
INSERT INTO locations (name, household_id) VALUES ('Basement', 1);
INSERT INTO locations (name, parent_location_id, household_id) VALUES ('Pantry', 1, 1);
INSERT INTO locations (name, parent_location_id, household_id) VALUES ('Basement Pantry', 3, 1);
INSERT INTO locations (name, household_id) VALUES ('Charlie''s Room', 1);
INSERT INTO locations (name, household_id) VALUES ('Theo''s Room', 1);
