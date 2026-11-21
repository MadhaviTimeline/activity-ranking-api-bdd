@ranking
Feature: Ranking activities by weather suitability
  As a user planning my week
  I want each day's activities ranked by how well the weather suits them
  So that I can see at a glance what is worth doing on each day

  The exact scoring formula belongs to the development team, so these scenarios use
  relative assertions ("ranks above", "ranks first", "is POOR") and metamorphic checks
  ("more snow never lowers the Skiing score") instead of asserting exact numbers.

  Scenario: Heavy snow and sub-zero temperatures in a mountain resort favour skiing
    Given a "heavy-snow-alpine" week is forecast for "Zermatt"
    When I request activity rankings for "Zermatt"
    Then Skiing ranks 1st on every day
    And Surfing ranks in the bottom two on every day

  Scenario: A large swell on a mild coast favours surfing over skiing
    Given a "big-swell-coastal" week is forecast for "Newquay"
    When I request activity rankings for "Newquay"
    Then Surfing ranks above Skiing on every day
    And Surfing is rated FAIR or better on every day

  Scenario: Clear skies and around 22°C favour outdoor sightseeing
    Given a "clear-warm" week is forecast for "Seville"
    When I request activity rankings for "Seville"
    Then Outdoor Sightseeing ranks 1st on every day
    And Outdoor Sightseeing is rated GOOD or better on every day

  Scenario Outline: Severe weather favours indoor sightseeing (<weather>)
    Given a "<forecast>" week is forecast for "Edinburgh"
    When I request activity rankings for "Edinburgh"
    Then Indoor Sightseeing ranks 1st on every day
    And Outdoor Sightseeing is rated POOR on every day

    Examples:
      | weather                 | forecast     |
      | persistent heavy rain   | heavy-rain   |
      | thunderstorms           | thunderstorm |
      | gale-force winds        | gale         |

  Scenario: An inland city with no wave data rates surfing as poor and says why
    Given a "clear-warm" week is forecast for "Madrid"
    And no wave data is available for "Madrid"
    When I request activity rankings for "Madrid"
    Then Surfing is rated POOR on every day
    And every Surfing reason explains that there is no coastline or wave data

  Scenario: Each day is ranked on its own weather, not on a weekly average
    Given the daily forecast for "Innsbruck" is:
      | days | weather    | max °C | min °C | snowfall cm | rain mm | wind km/h | sunshine h |
      | 1-3  | heavy snow | -4     | -12    | 30          | 0       | 15        | 1          |
      | 4-7  | clear      | 21     | 9      | 0           | 0       | 8         | 10         |
    When I request activity rankings for "Innsbruck"
    Then Skiing ranks 1st on days 1 to 3
    And Outdoor Sightseeing ranks above Skiing on days 4 to 7

  Scenario Outline: More snowfall never lowers the Skiing score (<less> cm vs <more> cm)
    Given an otherwise unchanging cold week in "Zermatt" with <less> cm of snowfall each day
    And I have noted the activity scores
    When the daily snowfall changes to <more> cm and I request the rankings again
    Then no day's Skiing score is lower than before

    Examples:
      | less | more |
      | 0    | 10   |
      | 10   | 30   |
      | 30   | 60   |

  Scenario Outline: More rain never raises the Outdoor Sightseeing score (<less> mm vs <more> mm)
    Given an otherwise unchanging mild week in "Seville" with <less> mm of rain each day
    And I have noted the activity scores
    When the daily rain changes to <more> mm and I request the rankings again
    Then no day's Outdoor Sightseeing score is higher than before

    Examples:
      | less | more |
      | 0    | 5    |
      | 5    | 20   |
      | 20   | 50   |
