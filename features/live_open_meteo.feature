@live
Feature: Open-Meteo contract drift check (live, opt-in)
  As the team owning the stub fixtures
  I want to check occasionally that the real Open-Meteo still looks like our fixtures
  So that a passing offline suite isn't built on an out-of-date picture of the provider

  These scenarios call the real Open-Meteo APIs directly (not the system under test).
  They need network access and are excluded from the default run: npm run test:live

  Scenario: Real geocoding returns places in the shape our fixtures assume
    When I search the real Open-Meteo place-name directory for "London"
    Then the real search results match the geocoding fixture shape
    And the real search results include "London" in "GB" with timezone "Europe/London"

  Scenario: Real forecast returns 7 days of every daily variable we rely on
    When I fetch the real 7-day Open-Meteo forecast for London
    Then the real forecast matches the forecast fixture shape
    And every daily variable has 7 values
    And the daily units are:
      | variable           | unit |
      | temperature_2m_max | °C   |
      | precipitation_sum  | mm   |
      | snowfall_sum       | cm   |
      | wind_speed_10m_max | km/h |
      | sunshine_duration  | s    |

  Scenario: Real marine forecast returns 7 days of wave heights for a coastal town
    When I fetch the real 7-day Open-Meteo wave forecast for Newquay
    Then the real wave forecast matches the marine fixture shape
    And every daily variable has 7 values
