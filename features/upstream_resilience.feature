@resilience
Feature: Resilience to Open-Meteo problems
  As a user
  I want a clear error, never made-up data, when the weather provider misbehaves
  So that I don't plan my week around a ranking that isn't based on a real forecast

  Open-Meteo is replaced by a programmable stub, so faults can be injected on demand
  and every request the service makes to it is recorded and can be inspected.

  Background:
    Given a "heavy-snow-alpine" week is forecast for "Zermatt"

  @smoke
  Scenario: The service asks Open-Meteo for the right forecast
    When I request activity rankings for "Zermatt"
    Then the forecast was requested with:
      | latitude      | 46.02126      |
      | longitude     | 7.74912       |
      | forecast_days | 7             |
      | timezone      | Europe/Zurich |
    And the forecast was requested in metric units
    And the wave forecast was requested for the same coordinates and 7 days

  Scenario: A forecast service failure is reported, with no partial data
    Given the forecast service responds with a server error
    When I request activity rankings for "Zermatt"
    Then the weather provider is reported as unavailable
    And no rankings are returned
    And the error response is safe to show to users

  Scenario Outline: An unusable forecast is rejected, not guessed at (<problem>)
    Given the forecast service responds with <problem>
    When I request activity rankings for "Zermatt"
    Then the weather provider is reported as unavailable
    And no rankings are returned

    Examples:
      | problem                          |
      | invalid JSON                     |
      | no daily section                 |
      | no snowfall values               |
      | only 3 days of data              |
      | an Open-Meteo error message      |

  Scenario: A slow forecast service times out within the time budget
    Given the forecast service takes 10 seconds to respond
    When I request activity rankings for "Zermatt"
    Then the weather provider is reported as timing out
    And the response arrived within the configured upstream timeout plus 2 seconds

  Scenario: Location search reports when the place-name directory is down
    Given the place-name directory responds with a server error
    When I search for locations matching "Zer"
    Then the weather provider is reported as unavailable

  Scenario: Rankings by city name report when the place-name directory is down
    Given the place-name directory responds with a server error
    When I request activity rankings for "Zermatt"
    Then the weather provider is reported as unavailable
    And no forecast was requested

  @ux
  Scenario: Missing wave data degrades surfing only, the rest of the week is still ranked
    Given the wave forecast service responds with a server error
    When I request activity rankings for "Zermatt"
    Then the rankings are returned
    And the rankings cover exactly 7 consecutive days
    And Skiing ranks 1st on every day
    And Surfing is rated POOR on every day
    And every Surfing reason explains that wave data is unavailable
