@ranking
Feature: Weather ranking rules across multiple cities
  As a user planning my week
  I want suitable activities to rank well in different locations
  So that rankings reflect the weather rather than a particular city

  Scenario Outline: Heavy snow and sub-zero temperatures favour skiing in mountain resorts (<city>)
    Given a "heavy-snow-alpine" week is forecast for "<city>"
    When I request activity rankings for "<city>"
    Then Skiing ranks 1st on every day
    And Surfing ranks in the bottom two on every day

    Examples:
      | city      |
      | Zermatt   |
      | Innsbruck |

  Scenario Outline: A large swell on a mild coast favours surfing (<city>)
    Given a "big-swell-coastal" week is forecast for "<city>"
    When I request activity rankings for "<city>"
    Then Surfing ranks above Skiing on every day
    And Surfing is rated FAIR or better on every day

    Examples:
      | city     |
      | Newquay  |
      | Auckland |

  Scenario Outline: Clear skies and around 22°C favour outdoor sightseeing (<city>)
    Given a "clear-warm" week is forecast for "<city>"
    When I request activity rankings for "<city>"
    Then Outdoor Sightseeing ranks 1st on every day
    And Outdoor Sightseeing is rated GOOD or better on every day

    Examples:
      | city    |
      | Seville |
      | Madrid  |
