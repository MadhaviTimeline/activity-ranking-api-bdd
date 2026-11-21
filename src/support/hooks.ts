import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { startPlaceholder } from '../../placeholder-sut/server';
import { OpenMeteoStub } from '../stubs/openMeteoStub';
import { describeResponse } from '../assertions/responseAssertions';
import { config } from './config';
import { runtime } from './runtime';
import type { ApiWorld } from './world';

// Long enough for the timeout scenario (upstream timeout + margin); everything else is fast.
setDefaultTimeout(config.upstreamTimeoutMs + 10_000);

BeforeAll(async function () {
  runtime.setStub(await OpenMeteoStub.start(config.stubPort));
  if (!config.externalSut) {
    runtime.setPlaceholder(await startPlaceholder(config.placeholderPort));
  }
});

Before(function (this: ApiWorld) {
  this.stub.reset();
});

After(function (this: ApiWorld, { result }) {
  if (result?.status !== Status.FAILED) return;
  const last = this.history.at(-1);
  if (last) this.attach(`Last API response:\n${describeResponse(last)}`, 'text/plain');
  this.attach(
    `Requests received by the Open-Meteo stub:\n${this.stub.describeRequests()}`,
    'text/plain',
  );
});

AfterAll(async function () {
  await runtime.stub().stop();
  const placeholder = runtime.placeholder();
  if (placeholder) {
    placeholder.closeAllConnections();
    await new Promise<void>((resolve) => placeholder.close(() => resolve()));
  }
});
