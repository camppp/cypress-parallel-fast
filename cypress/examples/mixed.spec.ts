function helperWithTwoWaits() {
  cy.wait(100);
  cy.wait(100);
}

describe('Mixed suite', () => {
  it('calls helper plus one wait', () => {
    helperWithTwoWaits();
    cy.wait(100);
  });

  it('standalone wait', () => {
    cy.wait(100);
  });
});
