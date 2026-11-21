@reasoning @ux
Feature: Human-readable reasoning for each ranking
  As a user looking at a ranked activity
  I want a short explanation of why it was ranked that way
  So that I can trust the ranking and judge it for myself

  Reasons are shown to users as-is, so they must be plain English, mention the weather
  that drove the score, quote values in metric units and never leak internal codes.

  Scenario Outline: Reasons mention the dominant weather driver (<activity> in <city>)
    Given a "<forecast>" week is forecast for "<city>"
    When I request activity rankings for "<city>"
    Then every <activity> reason list mentions one of: <keywords>

    Examples:
      | forecast          | city      | activity            | keywords             |
      | heavy-snow-alpine | Zermatt   | Skiing              | snow, snowfall       |
      | big-swell-coastal | Newquay   | Surfing             | wave, waves, swell   |
      | clear-warm        | Seville   | Outdoor Sightseeing | clear, sunny, sun    |
      | heavy-rain        | Edinburgh | Indoor Sightseeing  | rain, wet, showers   |

  Scenario: Values quoted in reasons match the forecast and use metric units
    Given the daily forecast for "Zermatt" is:
      | days | weather    | max °C | min °C | snowfall cm | rain mm | wind km/h | sunshine h |
      | 1    | heavy snow | -6.2   | -14.8  | 35.4        | 0       | 22        | 0.5        |
      | 2-7  | clear      | 22.3   | 11.0   | 0           | 0       | 9         | 11         |
    When I request activity rankings for "Zermatt"
    Then the Skiing reasons for day 1 quote about 35 cm of snow
    And the Outdoor Sightseeing reasons for day 2 quote about 22 °C

  Scenario: Reasons are display-ready text, never empty and never raw data
    Given a "storm-week" week is forecast for "Edinburgh"
    When I request activity rankings for "Edinburgh"
    Then every ranking has at least one reason
    And every reason is a non-blank sentence of at most 120 characters
    And no reason contains raw codes or placeholders such as "weather_code", "WMO", "null", "undefined" or "NaN"
    And no reason uses imperial units such as "°F", "mph", "inches" or "ft"

  Scenario: A POOR rating explains the negative factor
    Given a "storm-week" week is forecast for "Edinburgh"
    When I request activity rankings for "Edinburgh"
    Then every POOR Outdoor Sightseeing reason list mentions one of: rain, storm, thunder, wind, gale
