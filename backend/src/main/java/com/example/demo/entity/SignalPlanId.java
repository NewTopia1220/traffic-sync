package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

@Embeddable
@Getter @Setter @NoArgsConstructor @EqualsAndHashCode
public class SignalPlanId implements Serializable {

    @Column(name = "INT_NO")
    private String intNo;

    @Column(name = "PLAN_NO")
    private String planNo;

    @Column(name = "PLAN_IDX_NO")
    private String planIdxNo;
}
