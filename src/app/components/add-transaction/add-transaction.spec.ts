import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddTransaction } from './add-transaction';

describe('AddTransaction', () => {
  let component: AddTransaction;
  let fixture: ComponentFixture<AddTransaction>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddTransaction],
    }).compileComponents();

    fixture = TestBed.createComponent(AddTransaction);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
