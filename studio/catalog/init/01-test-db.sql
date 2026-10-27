-- banco separado para a suite de testes (npm --prefix studio run test:db), isolado do
-- banco de uso normal (pattern_catalog) para nao misturar dados de teste com o catalogo real
CREATE DATABASE pattern_catalog_test;
