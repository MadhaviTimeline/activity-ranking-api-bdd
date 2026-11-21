@validation
Feature: Validating activity ranking requests
  As a front-end developer
  I want unusable requests rejected quickly with a clear, safe error
  So that I can show the user a helpful message and never waste a weather lookup

  Every error uses one envelope: { "error": { "code", "message", "details" } }.
  "Safe" means JSON content, no stack traces, no internal or upstream URLs.

  Scenario Outline: Unusable input is rejected before any weather lookup (<description>)
    When I request activity rankings with the raw query "<raw query>"
    Then the request is rejected as invalid with a message about "<parameter>"
    And the error response is safe to show to users
    And the weather service was not contacted

    Examples:
      | description                  | raw query                   | parameter  |
      | no location given            |                             | city       |
      | city empty                   | city=                       | city       |
      | city whitespace only         | city=%20%20%20              | city       |
      | city one character           | city=Z                      | city       |
      | city over 100 characters     | city=[101 x a]              | city       |
      | both city and location id    | city=Zermatt&locationId=123 | locationId |
      | location id not a number     | locationId=abc              | locationId |
      | location id not whole        | locationId=12.5             | locationId |

  Scenario Outline: Injection-like input is handled safely (<description>)
    When I request activity rankings for "<city>"
    Then the request is refused as invalid or not found
    And the error response is safe to show to users
    And the error message contains no HTML markup

    Examples:
      | description     | city                          |
      | SQL injection   | '; DROP TABLE locations; --   |
      | script tag      | <script>alert(1)</script>     |

  Scenario: An unknown city is reported as not found
    When I request activity rankings for "Atlantisville"
    Then the location is reported as not found
    And the error message mentions "Atlantisville"
    And the error response is safe to show to users
    And no forecast was requested

  Scenario: An unknown location id is reported as not found
    When I request activity rankings for location id 999999999
    Then the location is reported as not found
    And no forecast was requested

  @ux
  Scenario: An ambiguous city name returns candidates so the user can pick one
    When I request activity rankings for "Springfield"
    Then the location is reported as ambiguous
    And the candidates include:
      | name        | region        | country       |
      | Springfield | Illinois      | United States |
      | Springfield | Massachusetts | United States |
      | Springfield | Missouri      | United States |
    And every candidate has the same shape as a location search match
    And no forecast was requested
