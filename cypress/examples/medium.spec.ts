describe('Medium suite', () => {
  it('waits five times', () => {
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
  });
});
