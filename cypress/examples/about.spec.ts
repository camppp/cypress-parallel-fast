describe('About Page', () => {
  it('should navigate from homepage', () => {
    cy.visit('https://example.com');
    cy.get('a').click();
    cy.url().should('include', 'iana.org');
  });

  it('should render without errors', () => {
    cy.visit('https://example.com');
    cy.window().its('console.error').should('not.be.called');
  });

  it('should have semantic html structure', () => {
    cy.visit('https://example.com');
    cy.get('body').should('be.visible');
    cy.get('div').should('have.length', 1);
  });
});
