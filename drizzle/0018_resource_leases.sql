CREATE TABLE resource_lease (
 resource TEXT NOT NULL,
 slot INTEGER NOT NULL,
 owner TEXT NOT NULL,
 until_ms INTEGER NOT NULL,
 PRIMARY KEY(resource,slot)
);
