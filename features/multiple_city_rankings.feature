@contract @smoke
Feature: Activity rankings for multiple cities
  As a front-end developer
  I want the API to resolve different city names and return their rankings
  So that I can display forecasts for different selected places

  Scenario Outline: Rankings for an exact city name echo the resolved location (<city>)
    Given a "mixed-week-alpine" week is forecast for "<city>"
    When I request activity rankings for "<city>"
    Then the rankings are returned
    And the rankings are for "<city>" in "<country>" with timezone "<timezone>"
    And the rankings response matches the activity rankings contract

    Examples:
      | city      | country     | timezone      |
      | Zermatt   | Switzerland | Europe/Zurich |
      | Innsbruck | Austria     | Europe/Vienna |
