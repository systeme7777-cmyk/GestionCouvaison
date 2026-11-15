-- =====================================================================
-- ANSAR ELEVAGE — Données initiales (espèces, catégories, produits, paramètres)
-- Idempotent : n'insère que ce qui n'existe pas encore.
-- =====================================================================

insert into public.ae_especes (nom, icone, ordre)
select v.nom, v.icone, v.ordre from (values
  ('Poules','🐔',1), ('Canards','🦆',2), ('Oies','🪿',3), ('Dindes','🦃',4),
  ('Cailles','🐦',5), ('Pintades','🐓',6)
) as v(nom, icone, ordre)
where not exists (select 1 from public.ae_especes e where e.nom = v.nom);

insert into public.ae_categories (nom, type, ordre)
select v.nom, v.type, v.ordre from (values
  ('Animaux vivants','animaux',1), ('Œufs','oeufs',2), ('Produits dérivés','derives',3)
) as v(nom, type, ordre)
where not exists (select 1 from public.ae_categories c where c.nom = v.nom);

insert into public.ae_produits (nom, espece_id, categorie_id, unite, categorie_revenu, seuil_alerte)
select v.nom,
       (select id from public.ae_especes where nom = v.espece),
       (select id from public.ae_categories where nom = v.categorie),
       v.unite, v.rev, v.seuil
from (values
  -- A. Animaux vivants
  ('Poussins','Poules','Animaux vivants','tête','Vente de poussins',0),
  ('Poulets','Poules','Animaux vivants','tête','Vente de poulets',0),
  ('Poules pondeuses','Poules','Animaux vivants','tête','Vente de poulets',0),
  ('Coqs','Poules','Animaux vivants','tête','Vente de poulets',0),
  ('Canetons','Canards','Animaux vivants','tête','Vente de canards',0),
  ('Canards adultes','Canards','Animaux vivants','tête','Vente de canards',0),
  ('Oisons','Oies','Animaux vivants','tête','Vente d''oies',0),
  ('Oies adultes','Oies','Animaux vivants','tête','Vente d''oies',0),
  ('Dindonneaux','Dindes','Animaux vivants','tête','Vente de dindes',0),
  ('Dindes adultes','Dindes','Animaux vivants','tête','Vente de dindes',0),
  ('Cailleteaux','Cailles','Animaux vivants','tête','Vente de cailles',0),
  ('Cailles adultes','Cailles','Animaux vivants','tête','Vente de cailles',0),
  ('Pintadeaux','Pintades','Animaux vivants','tête','Vente de pintades',0),
  ('Pintades adultes','Pintades','Animaux vivants','tête','Vente de pintades',0),
  -- B. Œufs
  ('Œufs de consommation','Poules','Œufs','œuf','Vente d''œufs',60),
  ('Œufs fécondés','Poules','Œufs','œuf','Vente d''œufs',0),
  ('Œufs à couver','Poules','Œufs','œuf','Vente d''œufs',0),
  ('Œufs de poule','Poules','Œufs','œuf','Vente d''œufs',0),
  ('Œufs de canard','Canards','Œufs','œuf','Vente d''œufs',0),
  ('Œufs d''oie','Oies','Œufs','œuf','Vente d''œufs',0),
  ('Œufs de dinde','Dindes','Œufs','œuf','Vente d''œufs',0),
  ('Œufs de caille','Cailles','Œufs','œuf','Vente d''œufs',0),
  ('Autres œufs',null,'Œufs','œuf','Vente d''œufs',0),
  -- C. Produits dérivés
  ('Volailles abattues',null,'Produits dérivés','pièce','Vente de viande',0),
  ('Viande de volaille',null,'Produits dérivés','kg','Vente de viande',0),
  ('Abats',null,'Produits dérivés','kg','Vente de viande',0),
  ('Fientes',null,'Produits dérivés','kg','Vente de fientes',0),
  ('Fumier',null,'Produits dérivés','kg','Vente de fientes',0),
  ('Plumes',null,'Produits dérivés','kg','Autres revenus',0)
) as v(nom, espece, categorie, unite, rev, seuil)
where not exists (select 1 from public.ae_produits p where p.nom = v.nom);

insert into public.ae_parametres (cle, valeur)
select v.cle, v.valeur from (values
  ('nom_exploitation', '"ANSAR ELEVAGE"'::jsonb),
  ('devise', '"FCFA"'::jsonb),
  ('tresorerie_initiale', '0'::jsonb),
  ('adresse', '""'::jsonb),
  ('telephone', '""'::jsonb),
  ('categories_depenses', '["Aliments","Vaccins","Médicaments","Matériel","Transport","Main-d''œuvre","Eau","Électricité","Entretien","Autres dépenses"]'::jsonb),
  ('categories_revenus', '["Vente d''œufs","Vente de poussins","Vente de poulets","Vente de canards","Vente d''oies","Vente de dindes","Vente de cailles","Vente de pintades","Vente de viande","Vente de fientes","Autres revenus"]'::jsonb),
  ('modes_paiement', '["Espèces","Mobile Money","Virement bancaire","Chèque","Crédit"]'::jsonb)
) as v(cle, valeur)
where not exists (select 1 from public.ae_parametres p where p.cle = v.cle);

-- Administrateur principal : propriétaire du compte Supabase
insert into public.ae_profils (id, nom, prenom, email, role, actif)
select u.id, 'Administrateur', 'Principal', u.email, 'admin_principal', true
from auth.users u
where lower(u.email) = 'systeme7777@gmail.com'
on conflict (id) do nothing;
