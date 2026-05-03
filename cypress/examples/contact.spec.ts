describe('Contact Page', () => {
  it('should display contact information', () => {
    cy.visit('https://example.com');
    cy.get('p').should('contain', 'for illustrative');
  });

  it('should respond to mobile viewport', () => {
    cy.viewport(375, 667);
    cy.visit('https://example.com');
    cy.get('h1').should('be.visible');
  });
});
