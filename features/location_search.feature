@search @ux
Feature: Location search (autocomplete)
  As a user typing a city or town name
  I want a list of possible matches as I type
  So that I can pick the exact place I mean before asking for activity rankings

  The front end calls this while the user types, so empty results are a normal state
  (not an error) and results must carry enough detail to tell similarly named places apart.
  The place-name directory is served by the stubbed Open-Meteo geocoding service and
  contains a fixed reference catalogue (see test/fixtures/open-meteo/geocoding).

  @smoke
  Scenario: A partial name returns several possible matches
    When I search for locations matching "Lon"
    Then the search succeeds
    And the matches include:
      | name        | region           | country        |
      | London      | England          | United Kingdom |
      | London      | Ontario          | Canada         |
      | Londonderry | Northern Ireland | United Kingdom |

  Scenario: Each match carries the details the UI needs to tell places apart
    When I search for locations matching "Lon"
    Then every match has an id, name, region, country, country code, coordinates and timezone
    And no two matches share the same name, region and country
    And the search response matches the location search contract

  Scenario: Matches are listed in a stable relevance order
    When I search for locations matching "Lon"
    Then the matches are listed in this order:
      | name        | country code |
      | London      | GB           |
      | London      | CA           |
      | Londonderry | GB           |

  Scenario Outline: Search ignores letter case and surrounding whitespace ("<query>")
    When I search for locations matching "<query>"
    Then the search succeeds
    And the matches are the same as for a search for "Lon"
    And the place-name directory was asked about "Lon" without surrounding whitespace

    Examples:
      | query   |
      | lon     |
      | LON     |
      | lOn     |
      |   Lon   |

  Scenario Outline: Accented and non-ASCII names are matched and returned intact ("<query>")
    When I search for locations matching "<query>"
    Then the search succeeds
    And the first match is named "<name>" in "<country>"

    Examples:
      | query                      | name                       | country        |
      | Zürich                     | Zürich                     | Switzerland    |
      | São Paulo                  | São Paulo                  | Brazil         |
      | Llanfairpwllgwyngyll       | Llanfairpwllgwyngyll       | United Kingdom |

  Scenario: A name that matches nothing returns an empty list, not an error
    When I search for locations matching "Xyzzyqwv"
    Then the search succeeds
    And there are no matches

  Scenario Outline: The number of matches is capped (<description>)
    When I search for locations matching "San" with a limit of "<limit>"
    Then the search succeeds
    And there are exactly <count> matches

    Examples:
      | description         | limit | count |
      | default limit       |       | 10    |
      | smaller limit       | 5     | 5     |
      | maximum limit       | 20    | 20    |

  @validation
  Scenario Outline: An out-of-range limit is rejected (<limit>)
    When I search for locations matching "San" with a limit of "<limit>"
    Then the request is rejected as invalid with a message about "limit"
    And the weather service was not contacted

    Examples:
      | limit |
      | 0     |
      | 21    |
      | -1    |
      | ten   |

  @validation
  Scenario Outline: Unusable search text is rejected with a helpful message (<description>)
    When I search for locations with the raw query "<raw query>"
    Then the request is rejected as invalid with a message about "query"
    And the weather service was not contacted

    Examples:
      | description         | raw query          |
      | query missing       |                    |
      | query empty         | query=             |
      | whitespace only     | query=%20%20%20    |
      | one character       | query=L            |
      | over 100 characters | query=[101 x a]    |
