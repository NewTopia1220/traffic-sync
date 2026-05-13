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
public class SignalPhaseId implements Serializable {

    @Column(name = "INT_NO")
    private String intNo;

    @Column(name = "MAP_NO")
    private String mapNo;
}
