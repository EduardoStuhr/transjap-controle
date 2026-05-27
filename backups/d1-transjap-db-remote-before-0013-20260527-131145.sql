PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0000_acoustic_snowbird.sql','2026-05-19 12:14:17');
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`icon` text NOT NULL,
	`hours` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`tone` text NOT NULL,
	`location` text NOT NULL,
	`last_maintenance` text NOT NULL,
	`series_number` text,
	`acquisition_date` text,
	`manufacturer` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
, `subtype` text NOT NULL DEFAULT '');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-232','ESCAVADEIRA 336','construction',8065,'Operação','success','CAMPO LOG 5','','','','','2026-05-19T12:22:10.307Z','2026-05-19T12:22:10.307Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-016','CARRETA PRANCHA','construction',0,'Operação','success','CAMPO LOG 5','','','','','2026-05-24T22:08:38.033Z','2026-05-24T22:08:38.033Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-018','Caminhão Truk - Mercedes Bens L 1621','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-020','Caminhão Truk - Mercedes Benz L 1618','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-022','Caminhão Truk - Mercedes Benz L 1620','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-024','Caminhão Truk - Mercedes Benz L 1620','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-026','Caminhão Truk - Mercedes Benz L 1517','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-028','Caminhão Truk - Mercedes Bens L 1518','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-030','Caminhão Prancha - Mercedes Benz L 1317','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-032','Trator de Pneus','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-034','Trator de esteiras - D30E','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-036','Carregadeira de rodas - 924-F','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-040','Retro-Escavadeira - 416-D 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-042','Carregadeira de rodas - 924-G','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-044','Retro-Escavadeira - 416-D 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-050','Retro-Escavadeira - 416-D 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-052','Retro-Escavadeira - 416-D 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-056','Escavadeira Hidráulica - 312 CL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-058','Escavadeira Hidráulica - 312 CL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-060','Escavadeira Hidráulica - 312 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-062','Escavadeira Hidráulica - 312 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-068','Caminhão Pipa - Ford F12000','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-070','Moto Niveladora - 120H','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-074','Escavadeira Hidráulica - 312 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-076','Escavadeira Hidráulica - 320 CL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-078','Caminhão Pipa - Mercedes Benz L 1218 R','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-080','Escavadeira Hidráulica - 320 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-084','Retro-Escavadeira - 416-E 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-086','Moto Niveladora - 120K','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-088','Moto Niveladora - 120K','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-090','Rolo Compactador - CP533E','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-092','Mini-carregadeira - 226B2','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-094','Escavadeira Hidráulica - 320 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-108','Mini-escavadeira - 302.5','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-118','Mini-escavadeira - 302.5','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-120','Escavadeira Hidráulica - 336 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-124','Trator de Pneus - A950 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-128','Trator de esteiras - D6N','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-130','Trator de esteiras - D5E','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-136','Compressor de Ar','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-142','Caminhão Pipa - Volvo VM 330','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-160','Escavadeira Hidráulica - 336 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-168','Gerador Stemac','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-192','Comboio - Mercedes Benz Accelo 1016','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-194','Escavadeira Hidráulica - 336 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-196','Escavadeira Hidráulica - 336 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-198','Escavadeira Hidráulica - 336 DL','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-206','Trator de Esteiras - D6T','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-214','Caminhão Pipa - Volvo VM 330','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-220','Gerador Caterpillar GEP 50-7','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-222','Carreta Prancha - Carrega Tudo 3 eixos','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-224','Acabadora EAR-800','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-226','Caminhão Pipa - Volkswagen 31259','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-228','Escavadeira Hidráulica - 320','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-230','Escavadeira Hidráulica - 320','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-234','Rompedor Hidraulico','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-236','Escavadeira Hidráulica - 130G','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-238','Escavadeira Hidráulica - 130G','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-240','Motoniveladora 140GC','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-242','Motoniveladora 140GC','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-244','Escavadeira Hidráulica - 345 GC','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-246','Rolo Compactador Müller - TI 18','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-250','Rolo Compactador Hamm','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-252','Grade Aradora - 16 discos','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-254','Rolo Dynapac DYN 7433 CA 25 D','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-256','Rolo Dynapac DYN 7201 CA 30','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-258','Trator John Deere','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-262','Caminhão Comboio - Mercedes Benz Atego 1418','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-264','Motoniveladora New Holland','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-266','Caminhão Pipa - Mercedes Benz Actros 4844 2011','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-268','Escavadeira Hidráulica - Volvo','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-270','Moto Bomba','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-274','Rolo Compactador Hamm','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-278','Moto Bomba','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-282','Trator Valtra BM135 4x4 Cabinado','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-284','Trator Valtra BM135 4x4','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-286','Grade do girico 16 discos','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-288','Grade','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-290','Moto Niveladora 140','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-292','Automóvel - Fiat Fiorino Endurance','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
INSERT INTO "equipment" ("id","model","icon","hours","status","tone","location","last_maintenance","series_number","acquisition_date","manufacturer","created_at","updated_at","subtype") VALUES('FR-294','Automóvel - CHEV ONIX 10TAT HB','construction',0,'Operação','success','','','','','','2026-05-27T11:07:01.721Z','2026-05-27T11:07:01.721Z','');
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`min_quantity` integer DEFAULT 0 NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`author` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `maintenance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`item` text DEFAULT '' NOT NULL,
	`service_description` text DEFAULT '' NOT NULL,
	`submitted_by` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
, `supplier_name` text DEFAULT '' NOT NULL, `material_description` text DEFAULT '' NOT NULL, `cost` real DEFAULT 0 NOT NULL);
CREATE TABLE `maintenance_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`completed_by` text DEFAULT '',
	`observation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `maintenance_records`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `maintenance_timeline` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `maintenance_records`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO "task_comments" ("id","task_id","author","text","timestamp") VALUES('CM-8C6E95D0','TK-937A4A59','luiz','conseguiu?','25/05/2026');
INSERT INTO "task_comments" ("id","task_id","author","text","timestamp") VALUES('CM-5C0E732F','TK-937A4A59','Eduardo','Para registro de atualização, estou implementando pra todos conseguirem verem a analise qualquer conta, ate amanhã cedo eu entrego pronto com registro das obras que estão havendo coletas Ok','2026-05-25T19:02:40.510Z');
INSERT INTO "task_comments" ("id","task_id","author","text","timestamp") VALUES('CM-3B61A0C2','TK-937A4A59','Luiz','assim que conseguir me avisa','2026-05-25T18:11:21.840Z');
INSERT INTO "task_comments" ("id","task_id","author","text","timestamp") VALUES('CM-23805527','TK-937A4A59','Eduardo','Estou executando para alinhar duas obras ao mesmo tempo na analise','2026-05-25T17:49:44.153Z');
INSERT INTO "task_comments" ("id","task_id","author","text","timestamp") VALUES('CM-5CFD4AE6','TK-EB7FFDF5','Teste','''','2026-05-26T10:02:30.647Z');
INSERT INTO "task_comments" ("id","task_id","author","text","timestamp") VALUES('CM-9520B84F','TK-937A4A59','Eduardo','Feito, Todos os dados foram extraídos diretamente do carcara, então por exemplo alguma segunda feira que não teve abastecimento mas teve produção, o abastecimento entrou na terça, Vou alinhar isso para ler as horas trabalhadas e dar o consumo de diesel em dia não abastecidos mas pelo horimetro rodado.','2026-05-26T11:32:51.350Z');
CREATE TABLE `task_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO "task_responses" ("id","task_id","author","text","attachments","timestamp") VALUES('RS-3090ADE2','TK-937A4A59','Eduardo','Concluído o relatório, somente acessar A área de Produção x Consumo , Clicar em análises Disponíveis E selecionar as duas Obras, Vou implementar também logo mais A Obra da serra.','[]','2026-05-26T11:29:21.497Z');
INSERT INTO "task_responses" ("id","task_id","author","text","attachments","timestamp") VALUES('RS-BCF68050','TK-EB7FFDF5','Teste','Ok','[]','2026-05-26T11:29:47.419Z');
CREATE TABLE `task_timeline` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`status` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-1E26D03B','TK-937A4A59','25/05/2026','Visualizado por Eduardo','Eduardo','Visualizado');
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-DAAEF429','TK-937A4A59','25/05/2026','Tarefa enviada por Luiz','Luiz','Não visualizado');
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-B008E79C','TK-937A4A59','2026-05-25T19:02:40.510Z','Eduardo comentou','Eduardo',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-64BD71E5','TK-937A4A59','2026-05-25T18:11:21.840Z','Luiz comentou','Luiz',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-07F91213','TK-937A4A59','2026-05-25T17:48:16.449Z','Visualizado por Luiz','Luiz',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-7E625E27','TK-EB7FFDF5','26/05/2026','Tarefa enviada por Eduardo','Eduardo','Não visualizado');
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-96F5A85F','TK-EB7FFDF5','2026-05-26T10:02:26.737Z','Visualizado por Teste','Teste',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-CC3340B2','TK-EB7FFDF5','2026-05-26T10:02:30.647Z','Teste comentou','Teste',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-85153F89','TK-937A4A59','2026-05-26T11:29:21.497Z','Eduardo respondeu','Eduardo',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-9B2E55BC','TK-937A4A59','2026-05-26T11:29:22.311Z','Tarefa concluída por Eduardo','Eduardo','Concluído');
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-C499337C','TK-EB7FFDF5','2026-05-26T11:29:47.419Z','Teste respondeu','Teste',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-2A7015A6','TK-EB7FFDF5','2026-05-26T11:29:48.226Z','Tarefa concluída por Teste','Teste','Concluído');
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-3109316F','TK-937A4A59','2026-05-26T11:32:51.350Z','Eduardo comentou','Eduardo',NULL);
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-D1E1D229','TK-00A36966','26/05/2026','Tarefa enviada por Eduardo','Eduardo','Não visualizado');
INSERT INTO "task_timeline" ("id","task_id","timestamp","action","actor","status") VALUES('EV-3B674025','TK-00A36966','2026-05-26T14:37:17.752Z','Visualizado por Luiz','Luiz',NULL);
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`assigned_to` text NOT NULL,
	`sector` text NOT NULL,
	`priority` text NOT NULL,
	`deadline` text,
	`status` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`viewed_by` text DEFAULT '{}' NOT NULL,
	`viewed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
, kind TEXT DEFAULT 'task' NOT NULL, created_by_user_id TEXT DEFAULT '' NOT NULL, responsible_ids TEXT DEFAULT '[]' NOT NULL, completed_at TEXT DEFAULT '' NOT NULL, completed_by TEXT DEFAULT '' NOT NULL);
INSERT INTO "tasks" ("id","title","description","equipment","assigned_to","sector","priority","deadline","status","created_by","attachments","viewed_by","viewed","created_at","updated_at","kind","created_by_user_id","responsible_ids","completed_at","completed_by") VALUES('TK-937A4A59','Relatório de produção x consumo','Faz um relatório de produção x consumo desse mês','','["Eduardo"]','Operacional','Média',NULL,'Concluído','Luiz','[]','{"usr-eduardo":"2026-05-25T19:09:40.523Z","Eduardo":"2026-05-25T19:09:40.523Z","usr-luiz":"2026-05-25T18:10:47.506Z","Luiz":"2026-05-25T18:10:47.506Z"}',1,'25/05/2026','2026-05-26T18:06:21.925Z','task','usr-luiz','["usr-eduardo"]','2026-05-26T11:29:22.311Z','Eduardo');
INSERT INTO "tasks" ("id","title","description","equipment","assigned_to","sector","priority","deadline","status","created_by","attachments","viewed_by","viewed","created_at","updated_at","kind","created_by_user_id","responsible_ids","completed_at","completed_by") VALUES('TK-EB7FFDF5','teste','','','["Teste"]','Operacional','Média',NULL,'Concluído','Eduardo','[]','{}',1,'26/05/2026','2026-05-26T11:29:48.226Z','task','usr-eduardo','["usr-teste"]','2026-05-26T11:29:48.226Z','Teste');
INSERT INTO "tasks" ("id","title","description","equipment","assigned_to","sector","priority","deadline","status","created_by","attachments","viewed_by","viewed","created_at","updated_at","kind","created_by_user_id","responsible_ids","completed_at","completed_by") VALUES('TK-00A36966','Aprovação para Inserir os equipamentos em manutenção',replace('Bom dia, Caso permitido, irei iniciar a colocar equipamentos em manutenção aqui dentro na parte de manutenção.\n\nPois fica mais fácil para Acompanhar.','\n',char(10)),'','["Luiz"]','Manutenção','Baixa',NULL,'Visualizado','Eduardo','[]','{}',1,'26/05/2026','2026-05-26T14:37:17.752Z','task','usr-eduardo','["usr-luiz"]','','');
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE store_documents (
        module TEXT NOT NULL,
        id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (module, id)
      );
INSERT INTO "store_documents" ("module","id","payload","created_at","updated_at") VALUES('inventory-items','IT-25472139','{"name":"PARAFUSO TESTE","category":"Peças","subcategory":"TESTE","manufacturer":"TESTE","internalCode":"TESTE","sku":"TESTE","barcode":"TESTE","technicalDescription":"","unit":"un","locationId":"","physicalLocation":"","minStock":0,"currentStock":0,"cost":20,"supplier":"EKIPAR TESTE","images":[],"notes":"","critical":false,"validityDate":"","id":"IT-25472139","qrCode":"TRANSJAP:ITEM:TESTE","updatedAt":"2026-05-19T12:23:39.814Z"}','2026-05-19T13:27:45.969Z','2026-05-19T13:27:45.969Z');
INSERT INTO "store_documents" ("module","id","payload","created_at","updated_at") VALUES('maintenance-records','MT-D41B670A','{"id":"MT-D41B670A","equipment":"FR-232","type":"Preventiva","technician":"","responsible":"Eduardo","status":"Concluída","currentStepId":"concluido","deadline":"","createdAt":"27/05/2026","startedAt":"2026-05-27T11:26:56.618Z","finishedAt":"2026-05-27T13:15:55.825Z","description":"","notes":"","serviceSummary":"Manutenção registrada como já concluída.","totalCost":0,"item":"MANGOTE DO OLEO DE MOTOR","serviceDescription":"MANGOTE DO OLEO DE MOTOR QUE VAI NO FILTRO LUBRIFICANTE ESTOURADO","submittedBy":"Eduardo","supplierName":"","materialDescription":"","cost":0,"costEntries":[],"steps":[{"id":"enviado_manutencao","label":"Enviado para manutenção","defaultSlaHours":8,"status":"concluida","slaHours":8,"startedAt":"2026-05-27T11:26:56.618Z","completedAt":"2026-05-27T11:27:19.671Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"","durationMinutes":0,"attachments":[]},{"id":"diagnostico","label":"Em diagnóstico","defaultSlaHours":24,"status":"concluida","slaHours":24,"startedAt":"2026-05-27T11:27:23.781Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":109,"attachments":[]},{"id":"aguardando_orcamento","label":"Aguardando orçamento","defaultSlaHours":24,"status":"concluida","slaHours":24,"startedAt":"2026-05-27T13:15:55.825Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":0,"attachments":[]},{"id":"orcamento_recebido","label":"Orçamento recebido","defaultSlaHours":8,"status":"concluida","slaHours":8,"startedAt":"2026-05-27T13:15:55.825Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":0,"attachments":[]},{"id":"aguardando_aprovacao","label":"Aguardando aprovação","defaultSlaHours":24,"status":"concluida","slaHours":24,"startedAt":"2026-05-27T13:15:55.825Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":0,"attachments":[]},{"id":"aguardando_peca","label":"Aguardando peça","defaultSlaHours":72,"status":"concluida","slaHours":72,"startedAt":"2026-05-27T13:15:55.825Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":0,"attachments":[]},{"id":"execucao","label":"Em execução","defaultSlaHours":24,"status":"concluida","slaHours":24,"startedAt":"2026-05-27T13:15:55.825Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":0,"attachments":[]},{"id":"concluido","label":"Concluído","defaultSlaHours":1,"status":"concluida","slaHours":1,"startedAt":"2026-05-27T13:15:55.825Z","completedAt":"2026-05-27T13:15:55.825Z","startedBy":"Eduardo","completedBy":"Eduardo","startNote":"","completionComment":"Manutenção registrada como já concluída.","durationMinutes":0,"attachments":[]}],"timeline":[{"id":"EV-A09B44A0","timestamp":"2026-05-27T13:15:55.825Z","user":"Eduardo","action":"Manutenção registrada como concluída","note":"Manutenção registrada como já concluída."},{"id":"EV-0C16F9B1","timestamp":"2026-05-27T11:27:23.781Z","user":"Eduardo","action":"Etapa iniciada","stepId":"diagnostico","note":""},{"id":"EV-4893FB76","timestamp":"2026-05-27T11:27:19.671Z","user":"Eduardo","action":"Etapa concluída","stepId":"enviado_manutencao","note":"Duração: 0 min"},{"id":"EV-01414F11","timestamp":"2026-05-27T11:26:56.618Z","user":"Eduardo","action":"Etapa iniciada","stepId":"enviado_manutencao","note":""},{"id":"EV-9B0033F2","timestamp":"2026-05-27T11:26:38.151Z","user":"Eduardo","action":"Manutenção criada","note":"MANGOTE DO OLEO DE MOTOR QUE VAI NO FILTRO LUBRIFICANTE ESTOURADO"}],"waitingParts":[]}','2026-05-27T11:26:35.808Z','2026-05-27T13:15:53.587Z');
CREATE TABLE task_recipients (
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      );
INSERT INTO "task_recipients" ("task_id","user_id","user_name","created_at") VALUES('TK-937A4A59','usr-eduardo','Eduardo','25/05/2026');
INSERT INTO "task_recipients" ("task_id","user_id","user_name","created_at") VALUES('TK-EB7FFDF5','usr-teste','Teste','26/05/2026');
INSERT INTO "task_recipients" ("task_id","user_id","user_name","created_at") VALUES('TK-00A36966','usr-luiz','Luiz','26/05/2026');
CREATE TABLE task_views (
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        viewed_at TEXT NOT NULL,
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      );
INSERT INTO "task_views" ("task_id","user_id","user_name","viewed_at") VALUES('TK-937A4A59','usr-eduardo','Eduardo','2026-05-26T18:06:21.925Z');
INSERT INTO "task_views" ("task_id","user_id","user_name","viewed_at") VALUES('TK-937A4A59','usr-luiz','Luiz','2026-05-25T18:10:47.506Z');
INSERT INTO "task_views" ("task_id","user_id","user_name","viewed_at") VALUES('TK-EB7FFDF5','usr-teste','Teste','2026-05-26T11:29:41.569Z');
INSERT INTO "task_views" ("task_id","user_id","user_name","viewed_at") VALUES('TK-00A36966','usr-luiz','Luiz','2026-05-26T14:37:17.752Z');
CREATE TABLE reminders (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'reminder',
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        time TEXT,
        end_time TEXT,
        location TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'blue',
        priority TEXT NOT NULL DEFAULT 'média',
        status TEXT NOT NULL DEFAULT 'pendente',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      , end_date TEXT, completed_at TEXT);
INSERT INTO "reminders" ("id","user_id","kind","title","description","date","time","end_time","location","color","priority","status","completed","created_at","updated_at","end_date","completed_at") VALUES('RM-1779713978940-zrtl3b','usr-teste','reminder','123123','3123','2026-05-30',NULL,NULL,'','green','média','pendente',0,'2026-05-25T12:59:38.940Z','2026-05-25T12:59:38.940Z',NULL,NULL);
INSERT INTO "reminders" ("id","user_id","kind","title","description","date","time","end_time","location","color","priority","status","completed","created_at","updated_at","end_date","completed_at") VALUES('RM-1779713986735-1c5ib1','usr-teste','reminder','321321','33123','2026-05-19',NULL,NULL,'','green','média','pendente',0,'2026-05-25T12:59:46.735Z','2026-05-25T12:59:46.735Z',NULL,NULL);
INSERT INTO "reminders" ("id","user_id","kind","title","description","date","time","end_time","location","color","priority","status","completed","created_at","updated_at","end_date","completed_at") VALUES('RM-1779714538027-dupnn8','usr-teste','reminder','testeofivial','','2026-05-10',NULL,NULL,'','green','média','pendente',0,'2026-05-25T13:08:58.027Z','2026-05-25T13:08:58.027Z',NULL,NULL);
INSERT INTO "reminders" ("id","user_id","kind","title","description","date","time","end_time","location","color","priority","status","completed","created_at","updated_at","end_date","completed_at") VALUES('RM-1779720314082-xnoq1m','usr-luiz','event','Reunião com Didio','ver terrenos','2026-05-29','14:00',NULL,'Fazenda do Estado','purple','alta','agendado',0,'2026-05-25T14:45:14.082Z','2026-05-25T14:45:49.448Z',NULL,NULL);
INSERT INTO "reminders" ("id","user_id","kind","title","description","date","time","end_time","location","color","priority","status","completed","created_at","updated_at","end_date","completed_at") VALUES('RM-1779887677254-tfg5m8','usr-eduardo','reminder','teste','teste','2026-05-27',NULL,NULL,'','green','média','pendente',0,'2026-05-27T13:14:37.254Z','2026-05-27T13:14:37.254Z','2026-05-30',NULL);
CREATE TABLE notifications (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      );
INSERT INTO "notifications" ("id","user_id","type","entity_type","entity_id","title","message","read_at","created_at","created_by") VALUES('NF-task_comment-CM-8C6E95D0-usr-eduardo','usr-eduardo','task_comment','task','TK-937A4A59','Novo comentario: Relatório de produção x consumo','Luiz comentou na tarefa.','2026-05-25T16:55:29.515Z','2026-05-25T16:53:12.287Z','usr-luiz');
INSERT INTO "notifications" ("id","user_id","type","entity_type","entity_id","title","message","read_at","created_at","created_by") VALUES('NF-task_created-TK-0A81D8CE-usr-teste','usr-teste','task_created','task','TK-0A81D8CE','Nova tarefa: teste','Eduardo atribuiu uma tarefa a voce.','2026-05-25T16:55:54.394Z','2026-05-25T16:55:45.034Z','usr-eduardo');
INSERT INTO "notifications" ("id","user_id","type","entity_type","entity_id","title","message","read_at","created_at","created_by") VALUES('NF-task_comment-CM-7B88F505-usr-eduardo','usr-eduardo','task_comment','task','TK-0A81D8CE','Novo comentario: teste','Teste comentou na tarefa.','2026-05-25T16:56:37.765Z','2026-05-25T16:56:24.276Z','usr-teste');
INSERT INTO "notifications" ("id","user_id","type","entity_type","entity_id","title","message","read_at","created_at","created_by") VALUES('NF-task_comment-CM-E50EBCF4-usr-eduardo','usr-eduardo','task_comment','task','TK-0A81D8CE','Novo comentario: teste','Teste comentou na tarefa.','2026-05-25T17:14:05.108Z','2026-05-25T17:13:22.470Z','usr-teste');
INSERT INTO "notifications" ("id","user_id","type","entity_type","entity_id","title","message","read_at","created_at","created_by") VALUES('NF-task_comment-CM-D5C82790-usr-eduardo','usr-eduardo','task_comment','task','TK-0A81D8CE','Novo comentario: teste','Teste comentou na tarefa.','2026-05-25T17:22:37.300Z','2026-05-25T17:14:27.986Z','usr-teste');
CREATE TABLE `fueling` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`vehicle_id` text DEFAULT '' NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`vehicle_type` text DEFAULT '' NOT NULL,
	`km_previous` real DEFAULT 0 NOT NULL,
	`km_current` real DEFAULT 0 NOT NULL,
	`liters` real DEFAULT 0 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`consumption` real DEFAULT 0 NOT NULL,
	`standard_consumption` real DEFAULT 0 NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`status` text,
	`import_batch_id` text NOT NULL,
	`imported_at` text NOT NULL
, `analysis_id` text DEFAULT 'legacy' NOT NULL);
CREATE TABLE `swell_factors` (
	`obra` text NOT NULL,
	`material` text NOT NULL,
	`factor` real DEFAULT 0.3 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`obra`, `material`)
);
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`datetime` text NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`operation` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`vehicle_id` text DEFAULT '' NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`driver` text DEFAULT '' NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`destination` text DEFAULT '' NOT NULL,
	`km` real DEFAULT 0 NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`cubic_m_loose` real DEFAULT 0 NOT NULL,
	`swell_factor_applied` real DEFAULT 0.3 NOT NULL,
	`cubic_m_compacted` real DEFAULT 0 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`status` text,
	`import_batch_id` text NOT NULL,
	`imported_at` text NOT NULL
, `analysis_id` text DEFAULT 'legacy' NOT NULL);
CREATE TABLE `production_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`date_start` text NOT NULL,
	`date_end` text NOT NULL,
	`swell_factor` real DEFAULT 0.3 NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL
, `tipo_analise` text DEFAULT 'operacional' NOT NULL, `metrics` text DEFAULT '{}' NOT NULL, `aggregate_metrics` text DEFAULT '[]' NOT NULL, `machine_metrics` text DEFAULT '[]' NOT NULL, `charts` text DEFAULT '{}' NOT NULL, `audit` text DEFAULT '[]' NOT NULL, `context` text DEFAULT '{}' NOT NULL, summary_metrics TEXT NOT NULL DEFAULT '{}');
CREATE TABLE `equipment_daily_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text DEFAULT 'legacy' NOT NULL,
	`fleet` text DEFAULT '' NOT NULL,
	`fleet_label` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`source_sheet` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'OK' NOT NULL,
	`used_in_analysis` integer DEFAULT true NOT NULL,
	`imported_at` text NOT NULL
, `horim_inicial` real NOT NULL DEFAULT 0, `horim_final` real NOT NULL DEFAULT 0);
CREATE TABLE `fuel_attribution` (
	`id` text PRIMARY KEY NOT NULL,
	`fleet` text NOT NULL,
	`fleet_label` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`obra` text DEFAULT '' NOT NULL,
	`hours_worked` real NOT NULL,
	`liters_attributed` real NOT NULL,
	`cost_attributed` real NOT NULL,
	`source_fueling_id` text,
	`calculated_at` text NOT NULL
, `analysis_id` text NOT NULL DEFAULT 'legacy');
CREATE TABLE task_notification_reads (
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE cascade
      );
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-EB7FFDF5','usr-eduardo','Eduardo','2026-05-26T11:30:36.630Z');
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-937A4A59','usr-luiz','Luiz','2026-05-26T14:37:04.536Z');
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-EB7FFDF5','usr-luiz','Luiz','2026-05-26T11:18:03.336Z');
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-937A4A59','usr-eduardo','Eduardo','2026-05-26T18:06:21.925Z');
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-EB7FFDF5','usr-teste','Teste','2026-05-26T11:29:41.569Z');
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-00A36966','usr-luiz','Luiz','2026-05-26T14:37:17.752Z');
INSERT INTO "task_notification_reads" ("task_id","user_id","user_name","read_at") VALUES('TK-00A36966','usr-eduardo','Eduardo','2026-05-26T18:06:14.355Z');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',1);
CREATE UNIQUE INDEX `inventory_items_sku_unique` ON `inventory_items` (`sku`);
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);
CREATE INDEX idx_tasks_kind ON tasks(kind);
CREATE INDEX idx_tasks_created_by_user_id ON tasks(created_by_user_id);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_task_recipients_user_id ON task_recipients(user_id);
CREATE INDEX idx_task_views_user_id ON task_views(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id);
CREATE INDEX `idx_fuelattr_fleet_date` ON `fuel_attribution` (`fleet`,`date`);
CREATE INDEX `idx_fuelattr_date` ON `fuel_attribution` (`date`);
CREATE INDEX `idx_fuelattr_obra` ON `fuel_attribution` (`obra`);
CREATE INDEX `idx_trips_analysis_date` ON `trips` (`analysis_id`, `datetime`);
CREATE INDEX `idx_fueling_analysis_date` ON `fueling` (`analysis_id`, `datetime`);
CREATE INDEX `idx_equipment_daily_parts_analysis_date` ON `equipment_daily_parts` (`analysis_id`, `date`);
CREATE INDEX `idx_equipment_daily_parts_fleet_analysis_date` ON `equipment_daily_parts` (`fleet`, `analysis_id`, `date`);
CREATE INDEX `idx_fuelattr_source_fueling` ON `fuel_attribution` (`source_fueling_id`);
CREATE INDEX idx_task_notification_reads_user_id ON task_notification_reads(user_id);
CREATE INDEX `idx_fuelattr_analysis` ON `fuel_attribution` (`analysis_id`);
