describe('Navigation', () => {
  it('should have working back button', () => {
    cy.visit('https://example.com');
    cy.get('a').click();
    cy.go('back');
    cy.url().should('eq', 'https://example.com/');
  });

  it('should support keyboard navigation', () => {
    cy.visit('https://example.com');
    cy.get('body').type('{tab}');
    cy.focused().should('be.visible');
  });

  it('should preserve scroll position', () => {
    cy.visit('https://example.com');
    cy.window().its('scrollY').should('eq', 0);
  });

  it('should handle external links', () => {
    cy.visit('https://example.com');
    cy.get('a').should('have.attr', 'href').and('include', 'iana.org');
  });

  it('should set correct referrer policy', () => {
    cy.request('https://example.com')
      .its('headers.referrer-policy')
      .should('match', /origin|strict-origin/);
  });
});
