@contract @smoke
Feature: Activity rankings response contract
  As a front-end developer
  I want every activity rankings response to have a predictable, display-ready shape
  So that I can render a 7-day ranked list without guessing or re-mapping data

  Scores themselves are owned by the implementation; this feature pins down the shape,
  the day/activity coverage, the ordering rules and the score-to-band mapping.

  Background:
    Given a "mixed-week-alpine" week is forecast for "Zermatt"

  Scenario: Rankings for an exact city name echo the resolved location
    When I request activity rankings for "Zermatt"
    Then the rankings are returned
    And the rankings are for "Zermatt" in "Switzerland" with timezone "Europe/Zurich"
    And the rankings response matches the activity rankings contract

  Scenario: The forecast covers 7 consecutive days starting today in the location's timezone
    When I request activity rankings for "Zermatt"
    Then the rankings cover exactly 7 consecutive days
    And the first day is today's date in "Europe/Zurich"

  Scenario Outline: "Today" is the location's local date, not the server's (<city>)
    Given a "mixed-week-alpine" week is forecast for "<city>"
    When I request activity rankings for "<city>"
    Then the first day is today's date in "<timezone>"
    And the rankings cover exactly 7 consecutive days

    Examples:
      | city     | timezone         |
      | Auckland | Pacific/Auckland |
      | Honolulu | Pacific/Honolulu |

  Scenario: Every day ranks each of the four activities exactly once
    When I request activity rankings for "Zermatt"
    Then every day ranks exactly these activities once each:
      | activity            | display name        |
      | SKIING              | Skiing              |
      | SURFING             | Surfing             |
      | OUTDOOR_SIGHTSEEING | Outdoor Sightseeing |
      | INDOOR_SIGHTSEEING  | Indoor Sightseeing  |

  Scenario: Ranks run 1 to 4 and follow the score, highest first
    When I request activity rankings for "Zermatt"
    Then every day's ranks are 1, 2, 3 and 4 with no duplicates
    And every day is ordered by score from highest to lowest
    And every score is a whole number from 0 to 100

  Scenario: Suitability labels match the documented score bands
    When I request activity rankings for "Zermatt"
    Then every suitability label matches its score according to these bands:
      | suitability | lowest score | highest score |
      | EXCELLENT   | 80           | 100           |
      | GOOD        | 60           | 79            |
      | FAIR        | 40           | 59            |
      | POOR        | 0            | 39            |

  Scenario: Equal scores are ordered by a fixed activity order so the UI never reshuffles
    Given a "hot-dry-inland" week is forecast for "Madrid"
    When I request activity rankings for "Madrid" twice
    Then both responses list the activities in the same order on every day
    And activities with equal scores appear in this order:
      | activity            |
      | SKIING              |
      | SURFING             |
      | OUTDOOR_SIGHTSEEING |
      | INDOOR_SIGHTSEEING  |

  Scenario: Ranking by location id gives the same result as ranking by city name
    Given I have searched for "Zermatt" and picked the first match
    When I request activity rankings for the picked location
    Then the rankings are returned
    And they match the rankings for "Zermatt", ignoring when they were generated
