# Guide de tests pour AnalyseActualités

## Installation des dépendances de test

```bash
pip install pytest pytest-cov
```

## Exécution des tests

### Tous les tests
```bash
pytest tests/ -v
```

### Tests spécifiques
```bash
pytest tests/test_date_utils.py -v
```

### Avec couverture de code
```bash
pytest --cov=utils tests/
```

### Avec rapport HTML de couverture
```bash
pytest --cov=utils --cov-report=html tests/
# Ouvrir htmlcov/index.html dans un navigateur
```

## Structure des tests

```
tests/
├── __init__.py
├── test_date_utils.py        # Tests des utilitaires de dates
├── test_http_utils.py         # À créer: Tests requêtes HTTP
├── test_api_client.py         # À créer: Tests client API
├── test_cache.py              # À créer: Tests système de cache
├── test_parallel.py           # À créer: Tests traitement parallèle
└── README.md                  # Ce fichier
```

## Exemple de test

```python
import pytest
from utils.date_utils import parse_simple_date

def test_parse_valid_date():
    """Test parsing d'une date valide."""
    result = parse_simple_date("2026-01-24")
    assert result is not None
    assert result.year == 2026
```

## Tests paramétrés

```python
@pytest.mark.parametrize("date_str,expected", [
    ("2026-01-24", True),
    ("invalid", False),
])
def test_dates(date_str, expected):
    result = is_valid_date(date_str)
    assert result == expected
```

## Mocking pour tests HTTP

```python
from unittest.mock import Mock, patch

def test_fetch_with_mock():
    with patch('requests.get') as mock_get:
        mock_response = Mock()
        mock_response.content = b'<html>Test</html>'
        mock_get.return_value = mock_response
        
        result = fetch_and_extract_text('https://example.com')
        assert 'Test' in result
```

## Bonnes pratiques

1. **Nommer clairement** les tests: `test_fonction_cas_test()`
2. **Un test = un concept**: Ne tester qu'une chose par test
3. **AAA pattern**: Arrange, Act, Assert
4. **Utiliser des fixtures** pour réutiliser du code de setup
5. **Tests paramétrés** pour tester plusieurs cas similaires
6. **Mock les appels externes** (API, fichiers, réseau)

## Tests à implémenter

### Priorité HAUTE
- [ ] test_http_utils.py - Tests requêtes HTTP avec mock
- [ ] test_cache.py - Tests système de cache
- [ ] test_config.py - Tests configuration

### Priorité MOYENNE
- [ ] test_api_client.py - Tests client API avec mock
- [ ] test_parallel.py - Tests traitement parallèle

### Priorité BASSE
- [ ] Integration tests - Tests end-to-end
- [ ] Performance tests - Tests de charge

## CI/CD (à venir)

Créer `.github/workflows/tests.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    - name: Set up Python
      uses: actions/setup-python@v2
      with:
        python-version: '3.10'
    
    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install pytest pytest-cov
    
    - name: Run tests
      run: pytest --cov=utils tests/
```

## Métriques de qualité

Objectifs de couverture:
- **utils/**: 80%+ de couverture
- **scripts/**: 60%+ de couverture
- **Fonctions critiques**: 100% de couverture

## Ressources

- [Pytest documentation](https://docs.pytest.org/)
- [Pytest-cov documentation](https://pytest-cov.readthedocs.io/)
- [Python unittest.mock](https://docs.python.org/3/library/unittest.mock.html)
