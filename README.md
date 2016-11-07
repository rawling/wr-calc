# wr-calc
World Rugby rankings calculator

## Release notes

### 0.4
- Test new staging workflow
- Show separate loading messages for rankings and fixtures
- Use numeric inputs for scores
- ADd aiblity to add rows above loaded fixtures

### 0.3

- Automatically populate with a week of upcoming fixtures (thanks to [marcoas](https://github.com/rawling/wr-calc/pull/2))
- Replace JSONP call for rankings with `$.get` prompted by the above

### 0.2

- Fix issue with columns misaligning after calculating
- Split out JS and CSS into separate files

### 0.1

- Import from http://irbrankingcalculator.azurewebsites.net/ and fix links to be protocol-relative
- Change IRB to World Rugby