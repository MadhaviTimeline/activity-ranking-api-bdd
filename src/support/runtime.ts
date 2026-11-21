/** Process-wide handles started once in BeforeAll (stub server, placeholder SUT). */
import type { Server } from 'node:http';
import type { OpenMeteoStub } from '../stubs/openMeteoStub';

let stubInstance: OpenMeteoStub | undefined;
let placeholderInstance: Server | undefined;

export const runtime = {
  stub(): OpenMeteoStub {
    if (!stubInstance)
      throw new Error('The Open-Meteo stub is not running (BeforeAll hook did not run?).');
    return stubInstance;
  },
  setStub(stub: OpenMeteoStub | undefined): void {
    stubInstance = stub;
  },
  placeholder(): Server | undefined {
    return placeholderInstance;
  },
  setPlaceholder(server: Server | undefined): void {
    placeholderInstance = server;
  },
};
