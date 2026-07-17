-- 0003_seed_markets.sql · seed market_profiles for IN and US
insert into market_profiles (market_code, config, version, active) values
('IN', '{
  "display_name":"India","locale":"en-IN",
  "currency":{"code":"INR","symbol":"₹","format":"##,##,###"},
  "units":"imperial","area_basis":"carpet_area",
  "tax":{"name":"GST","default_rate":0.18,"applies_to":"interior_works"},
  "rate_library_ref":"rates_in_v1",
  "standards":{"ergonomics":"NBC_IS","kitchen":"generic_work_triangle","accessibility":null},
  "cultural_rules":[{"id":"vastu","label":"Vastu Shastra","default_on":true,
    "constraints":["entrance_preferred: N,E,NE","kitchen_zone: SE","pooja_zone: NE","master_bedroom_zone: SW","no_toilet_in: NE"]}],
  "construction_modes":["modular","site_carpentry"],
  "brand_tiers":{"economy":["local_ply","local_hardware"],
    "premium":["century_ply","hettich","asian_paints"],
    "luxury":["acrylic_shutters","blum","quartz"]}
}'::jsonb, 1, true),
('US', '{
  "display_name":"United States","locale":"en-US",
  "currency":{"code":"USD","symbol":"$","format":"#,###.##"},
  "units":"imperial","area_basis":"square_footage",
  "tax":{"name":"Sales Tax","default_rate":0.0,"applies_to":"by_state"},
  "rate_library_ref":"rates_us_v1",
  "standards":{"ergonomics":"IRC","kitchen":"NKBA","accessibility":"ADA"},
  "cultural_rules":[{"id":"feng_shui","label":"Feng Shui","default_on":false,
    "constraints":["command_position_bed","no_bed_under_window"]}],
  "construction_modes":["modular","custom_millwork"],
  "brand_tiers":{"economy":["ikea","home_depot_stock"],
    "premium":["semi_custom_cabinetry","quartz"],
    "luxury":["custom_millwork","designer_appliances"]}
}'::jsonb, 1, true)
on conflict (market_code) do update set config = excluded.config, updated_at = now();
