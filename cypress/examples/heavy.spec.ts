describe('Heavy suite', () => {
  it('waits ten times', () => {
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
    cy.wait(100);
  });
});
